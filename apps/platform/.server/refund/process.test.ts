import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { dist_refund_update, dists_for_refund } from "../pg/queries/dist";
import type { DbOrTx } from "../pg/queries/helpers";
import { bal_txs } from "../pg/schema/bal-tx";
import { dists } from "../pg/schema/dist";
import {
  donation_donors,
  donation_recipients,
  donations,
} from "../pg/schema/donation";
import { donation_match_events } from "../pg/schema/match";
import { npos } from "../pg/schema/npo";
import { payouts } from "../pg/schema/payout";
import { referrer_commissions } from "../pg/schema/referrer";
import { loss_logs } from "../pg/schema/revenue";
import type { TestDb } from "../pg/test-utils/pglite";

// --- mocks ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("../pg/db", () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        const real = test_db.current?.db;
        if (!real) throw new Error("test_db not initialized");
        return (real as any)[prop];
      },
    }
  ),
}));

const fiat_alert = vi.hoisted(() => vi.fn());
vi.mock("../kit/discord", () => ({ fiat_monitor: { send_alert: fiat_alert } }));

const report_error = vi.hoisted(() => vi.fn());
vi.mock("#/errors/report", () => ({ report_error }));

// the heads-up's only side effect. mocked at the module rather than at the
// transport, so a test can make the send throw as well as refuse.
const send_email = vi.hoisted(() => vi.fn());
vi.mock("../email", () => ({ send_email }));

// pglite has one connection, so a writer that keeps winning the payout's
// compare-and-set is stood in for at the query: each miss reports the payout
// already moved while the row itself stays pending.
const cas = vi.hoisted(() => ({ misses: 0 }));
vi.mock("../pg/queries/payout", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../pg/queries/payout")>();
  return {
    ...orig,
    payout_move_from_pending: (
      ...args: Parameters<typeof orig.payout_move_from_pending>
    ) => {
      if (cas.misses === 0) return orig.payout_move_from_pending(...args);
      cas.misses--;
      return Promise.resolve(false);
    },
  };
});

// pglite has one connection, so a writer that commits between two dists' runs
// is stood in for at the plan's npo read, which runs outside any transaction
const between_dists = vi.hoisted(() => ({
  once: null as (() => Promise<void>) | null,
}));
vi.mock("../pg/queries/npo", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../pg/queries/npo")>();
  return {
    ...orig,
    npo_get: async (...args: Parameters<typeof orig.npo_get>) => {
      const hook = between_dists.once;
      between_dists.once = null;
      await hook?.();
      return orig.npo_get(...args);
    },
  };
});

// --- imports (after mocks) ---

import { create_test_db } from "../pg/test-utils/pglite";
import { process_refund } from "./process";
import { reverse_unfunded_payout_loss } from "./unfunded";

// --- setup ---

const as_db = (x: unknown) => x as DbOrTx;
const ctx = { form_id: null, program_id: null, alert_from: "test" };
let counter = 0;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  cas.misses = 0;
  between_dists.once = null;
  send_email.mockResolvedValue({ data: { id: "msg-1" }, error: null });
  await test_db.current!.db.delete(bal_txs);
  await test_db.current!.db.delete(loss_logs);
  await test_db.current!.db.delete(payouts);
  await test_db.current!.db.delete(dists);
  await test_db.current!.db.delete(donation_match_events);
  await test_db.current!.db.delete(donation_donors);
  await test_db.current!.db.delete(donation_recipients);
  await test_db.current!.db.delete(donations);
  await test_db.current!.db.delete(referrer_commissions);
  await test_db.current!.db.delete(npos);
  counter = 0;
});

/**
 * a settled donation, optionally with a match event. no dists: an empty graph
 * list is the shape that isolates the finalization step, so what runs is
 * exactly the status flip, the void, and the heads-up.
 */
async function seed(o?: {
  stamps?: Partial<{ pack_sent_at: string; submitted_at: string }>;
  event?: boolean;
  company_name?: string | null;
}) {
  counter++;
  const db = test_db.current!.db;
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: `EIN-REF-${counter}`,
      name: `Test NPO ${counter}`,
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();

  const id = `don-${counter}`;
  await db.insert(donations).values({
    id,
    upusd: 1,
    status: "settled",
    amount_base: 250,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
  await db.insert(donation_recipients).values({
    donation_id: id,
    npo_id: npo!.id,
    name: npo!.name,
    type: "npo",
  });
  await db.insert(donation_donors).values({
    donation_id: id,
    email: "donor@test.com",
    name: "Ada Lovelace",
    company_name: o?.company_name ?? "Acme Inc",
  });

  if (o?.event !== false) {
    await db.insert(donation_match_events).values({
      id: `evt-${counter}`,
      donation_id: id,
      pack_sent_at: "2026-07-01T00:00:00.000Z",
      ...o?.stamps,
    });
  }
  return { id, npo_id: npo!.id, npo_name: npo!.name };
}

const events = () => test_db.current!.db.select().from(donation_match_events);
const dons = () => test_db.current!.db.select().from(donations);

describe("process_refund — voiding the match event", () => {
  test("stamps the void alongside the status flip", async () => {
    const { id } = await seed();

    await process_refund(id, [], ctx);

    expect((await dons())[0]!.status).toBe("refunded");
    const [ev] = await events();
    expect(ev!.voided_at).not.toBeNull();
    expect(ev!.void_reason).toBe("refunded");
  });

  test("a donation that never entered the workflow still flips", async () => {
    const { id } = await seed({ event: false });

    await process_refund(id, [], ctx);

    expect((await dons())[0]!.status).toBe("refunded");
    expect(await events()).toHaveLength(0);
  });
});

describe("process_refund — the filed-claim heads-up", () => {
  test("mails the team when the donor had already filed", async () => {
    const { id, npo_name } = await seed({
      stamps: { submitted_at: "2026-07-02T00:00:00.000Z" },
    });

    await process_refund(id, [], ctx);

    expect(send_email).toHaveBeenCalledTimes(1);
    const sent = send_email.mock.calls[0]![0];
    // internal only: the beneficiary has nothing to answer, and the donor asked
    // for their own money back
    expect(sent.to).toEqual(["hi@better.giving"]);
    const data = sent.node.props;
    expect(data.employer_name).toBe("Acme Inc");
    expect(data.donor_email).toBe("donor@test.com");
    expect(data.to_name).toBe(npo_name);
    expect(data.filed_at).toBe("2026-07-02T00:00:00.000Z");
    expect(data.void_reason).toBe("refunded");
  });

  test("says nothing when the claim was never filed", async () => {
    // the pack went out and the donor never came back — there is no claim
    // outstanding anywhere, so a refund is unremarkable
    const { id } = await seed();

    await process_refund(id, [], ctx);

    expect(send_email).not.toHaveBeenCalled();
  });

  test("says nothing when there is no event at all", async () => {
    const { id } = await seed({ event: false });

    await process_refund(id, [], ctx);

    expect(send_email).not.toHaveBeenCalled();
  });

  test("a refused send is reported and does not fail the refund", async () => {
    const { id } = await seed({
      stamps: { submitted_at: "2026-07-02T00:00:00.000Z" },
    });
    // send_email swallows provider errors into its return
    send_email.mockResolvedValue({ data: null, error: new Error("550") });

    const res = await process_refund(id, [], ctx);

    expect(res.failures).toEqual([]);
    expect(report_error).toHaveBeenCalled();
    // the money is already back; a missing notice is not a failed refund
    expect((await dons())[0]!.status).toBe("refunded");
  });

  test("a throwing send does not fail the refund either", async () => {
    const { id } = await seed({
      stamps: { submitted_at: "2026-07-02T00:00:00.000Z" },
    });
    send_email.mockRejectedValue(new Error("connection reset"));

    await expect(process_refund(id, [], ctx)).resolves.toMatchObject({
      failures: [],
    });
    expect((await dons())[0]!.status).toBe("refunded");
  });
});

describe("process_refund — concurrent runs", () => {
  test("two runs on the same stale graphs reverse the dist once", async () => {
    const { id, npo_id } = await seed({
      stamps: { submitted_at: "2026-07-02T00:00:00.000Z" },
    });
    const db = test_db.current!.db;
    await db
      .update(npos)
      .set({ liq: 1000, lock_units: 0, cash: 0 })
      .where(eq(npos.id, npo_id));
    await db.insert(dists).values({
      id: `dist-${id}`,
      donation_id: id,
      status: "settled",
      date_created: "2026-07-01T00:00:00.000Z",
      to_id: npo_id,
      to_name: "npo",
      amount: 100,
      amount_denom: "USD",
      net: 100,
      fee_base: 0,
      fee_fsa: 0,
      fee_processing: 0,
      alloc: { liq: 100, lock: 0, cash: 0 },
    });

    // a redelivery racing the original: both loaded before either committed
    const graphs = await dists_for_refund(id);
    await Promise.all([
      process_refund(id, graphs, ctx),
      process_refund(id, graphs, ctx),
    ]);

    const [npo] = await db.select().from(npos).where(eq(npos.id, npo_id));
    expect(npo!.liq).toBe(900);
    expect(await db.select().from(bal_txs)).toHaveLength(1);
    const [dist] = await db.select().from(dists);
    expect(dist!.status).toBe("refunded");
    expect(dist!.refund_status).toBe("completed");
    expect((await dons())[0]!.status).toBe("refunded");
    expect(send_email).toHaveBeenCalledTimes(1);
  });

  test("a failure write does not land on a dist another run reversed", async () => {
    const { id, npo_id } = await seed({ event: false });
    const db = test_db.current!.db;
    await db.insert(dists).values({
      id: `dist-${id}`,
      donation_id: id,
      status: "refunded",
      refund_status: "completed",
      date_created: "2026-07-01T00:00:00.000Z",
      to_id: npo_id,
      amount_denom: "USD",
    });

    await dist_refund_update(as_db(db), `dist-${id}`, {
      refund_status: "failed",
      refund_error: "boom",
    });

    const [dist] = await db.select().from(dists);
    expect(dist!.refund_status).toBe("completed");
    expect(dist!.refund_error).toBeNull();
  });
});

describe("process_refund — a dist written mid-refund", () => {
  async function seed_dist(
    donation_id: string,
    to_id: number | null,
    amount = 100
  ) {
    await test_db.current!.db.insert(dists).values({
      id: `dist-${donation_id}-${to_id}`,
      donation_id,
      status: "settled",
      date_created: "2026-07-01T00:00:00.000Z",
      to_id,
      to_name: "npo",
      amount,
      amount_denom: "USD",
      net: amount,
      fee_base: 0,
      fee_fsa: 0,
      fee_processing: 0,
      alloc: { liq: 100, lock: 0, cash: 0 },
    });
  }

  test("a dist committed after the snapshot is reversed before the flip", async () => {
    const { id, npo_id } = await seed({ event: false });
    const db = test_db.current!.db;
    await db
      .update(npos)
      .set({ liq: 1000, lock_units: 0, cash: 0 })
      .where(eq(npos.id, npo_id));
    // the caller's snapshot saw no dists; a stale settle_npo commits one after
    const graphs = await dists_for_refund(id);
    await seed_dist(id, npo_id);

    const res = await process_refund(id, graphs, ctx);

    expect(res.failures).toEqual([]);
    expect(res.applied).toBe(1);
    const [npo] = await db.select().from(npos).where(eq(npos.id, npo_id));
    expect(npo!.liq).toBe(900);
    const [dist] = await db.select().from(dists);
    expect(dist!.status).toBe("refunded");
    expect(dist!.refund_status).toBe("completed");
    expect((await dons())[0]!.status).toBe("refunded");
  });

  test("a straggler that fails to reverse leaves the donation settled", async () => {
    const { id } = await seed({ event: false });
    const graphs = await dists_for_refund(id);
    // no npo to reverse against: the plan load throws
    await seed_dist(id, null);

    const res = await process_refund(id, graphs, ctx);

    expect(res.failures).toHaveLength(1);
    expect(report_error).toHaveBeenCalled();
    const [dist] = await test_db.current!.db.select().from(dists);
    expect(dist!.status).toBe("settled");
    expect(dist!.refund_status).toBe("failed");
    expect((await dons())[0]!.status).toBe("settled");
  });
});

describe("process_refund — a payout the grants cron settles mid-refund", () => {
  async function seed_cash_dist(donation_id: string, npo_id: number) {
    const db = test_db.current!.db;
    await db.update(npos).set({ cash: 100 }).where(eq(npos.id, npo_id));
    await db.insert(dists).values({
      id: `dist-${donation_id}`,
      donation_id,
      status: "settled",
      date_created: "2026-07-01T00:00:00.000Z",
      to_id: npo_id,
      to_name: "npo",
      amount: 100,
      amount_denom: "USD",
      net: 100,
      fee_base: 0,
      fee_fsa: 0,
      fee_processing: 0,
      alloc: { liq: 0, lock: 0, cash: 100 },
    });
    await db.insert(payouts).values({
      id: `payout-${donation_id}`,
      source_id: `dist-${donation_id}`,
      npo_id,
      source: "donation",
      date: "2026-07-01T00:00:00.000Z",
      amount: 100,
      type: "pending",
    });
  }

  test("a payout settled after the graph was read ends in a logged loss", async () => {
    const { id, npo_id } = await seed({ event: false });
    await seed_cash_dist(id, npo_id);
    const db = test_db.current!.db;
    const graphs = await dists_for_refund(id);
    // the cron commits its settle after the caller's snapshot, before the CAS
    await db
      .update(payouts)
      .set({ type: "settled", settled_date: "2026-07-02T00:00:00.000Z" })
      .where(eq(payouts.id, `payout-${id}`));

    const res = await process_refund(id, graphs, ctx);

    expect(res.failures).toEqual([]);
    const [dist] = await db.select().from(dists);
    expect(dist!.status).toBe("refunded");
    expect(dist!.refund_status).toBe("loss");
    const logs = await db.select().from(loss_logs);
    expect(logs.map((l) => [l.dist_id, l.type])).toEqual([
      [`dist-${id}`, "payout"],
    ]);
    // the settled payout's cash already left; nothing to take back
    const [npo] = await db.select().from(npos).where(eq(npos.id, npo_id));
    expect(npo!.cash).toBe(100);
    const [po] = await db.select().from(payouts);
    expect(po!.type).toBe("refunded_loss");
    expect((await dons())[0]!.status).toBe("refunded_loss");
  });

  test("a payout the cron claimed for a transfer in flight ends in a logged loss", async () => {
    const { id, npo_id } = await seed({ event: false });
    await seed_cash_dist(id, npo_id);
    const db = test_db.current!.db;
    const graphs = await dists_for_refund(id);
    // the cron commits its claim after the caller's snapshot, before the CAS
    await db
      .update(payouts)
      .set({ type: "processing" })
      .where(eq(payouts.id, `payout-${id}`));

    const res = await process_refund(id, graphs, ctx);

    expect(res.failures).toEqual([]);
    const [dist] = await db.select().from(dists);
    expect(dist!.refund_status).toBe("loss");
    const logs = await db.select().from(loss_logs);
    expect(logs.map((l) => [l.dist_id, l.type])).toEqual([
      [`dist-${id}`, "payout"],
    ]);
    // the cash is on its way to the npo; the settle takes it off the balance
    const [npo] = await db.select().from(npos).where(eq(npos.id, npo_id));
    expect(npo!.cash).toBe(100);
    const [po] = await db.select().from(payouts);
    expect(po!.type).toBe("refunded_loss");
  });

  test("a payout that is stale on the re-plan too leaves the dist failed", async () => {
    const { id, npo_id } = await seed({ event: false });
    await seed_cash_dist(id, npo_id);
    const db = test_db.current!.db;
    const graphs = await dists_for_refund(id);
    cas.misses = 2;

    const res = await process_refund(id, graphs, ctx);

    // both attempts ran: the plan and the one re-plan
    expect(cas.misses).toBe(0);
    expect(res.failures).toEqual([
      `dist dist-${id}: payout:payout-${id} is no longer pending`,
    ]);
    const [dist] = await db.select().from(dists);
    expect(dist!.status).toBe("settled");
    expect(dist!.refund_status).toBe("failed");
    expect(await db.select().from(loss_logs)).toHaveLength(0);
    const [po] = await db.select().from(payouts);
    expect(po!.type).toBe("pending");
    expect((await dons())[0]!.status).toBe("settled");
  });
});

describe("process_refund — a loss reversed before the flip", () => {
  async function seed_cash_dist(
    donation_id: string,
    npo_id: number,
    n: number,
    payout_type: "pending" | "processing"
  ) {
    const db = test_db.current!.db;
    await db.insert(dists).values({
      id: `dist-${n}`,
      donation_id,
      status: "settled",
      date_created: "2026-07-01T00:00:00.000Z",
      to_id: npo_id,
      to_name: "npo",
      amount: 100,
      amount_denom: "USD",
      net: 100,
      fee_base: 0,
      fee_fsa: 0,
      fee_processing: 0,
      alloc: { liq: 0, lock: 0, cash: 100 },
    });
    await db.insert(payouts).values({
      id: `payout-${n}`,
      source_id: `dist-${n}`,
      npo_id,
      source: "donation",
      date: "2026-07-01T00:00:00.000Z",
      amount: 100,
      type: payout_type,
    });
  }

  test("a loss the grants cron reverses while a sibling dist is still refunding ends the donation refunded", async () => {
    const { id, npo_id } = await seed();
    const db = test_db.current!.db;
    await db.update(npos).set({ cash: 100 }).where(eq(npos.id, npo_id));
    const [other] = await db
      .insert(npos)
      .values({
        registration_number: "EIN-REF-OTHER",
        name: "Other NPO",
        endow_designation: "Charity",
        overview_pt: "[]",
        hq_country: "United States",
        cash: 100,
      })
      .returning();
    // dist-1's payout is in flight, so its refund is a loss
    await seed_cash_dist(id, npo_id, 1, "processing");
    await seed_cash_dist(id, other!.id, 2, "pending");
    const graphs = (await dists_for_refund(id)).sort((a, b) =>
      a.dist.id.localeCompare(b.dist.id)
    );
    // its transfer goes unfunded once dist-1 is refunded, before dist-2 is
    let reversed: unknown;
    between_dists.once = async () => {
      between_dists.once = async () => {
        reversed = await db.transaction((tx) =>
          reverse_unfunded_payout_loss(as_db(tx), "payout-1")
        );
      };
    };

    const res = await process_refund(id, graphs, ctx);

    expect(reversed).toEqual({ status: "reversed" });
    expect(res.failures).toEqual([]);
    const refund_status = await db
      .select({ id: dists.id, refund_status: dists.refund_status })
      .from(dists)
      .orderBy(dists.id);
    expect(refund_status).toEqual([
      { id: "dist-1", refund_status: "completed" },
      { id: "dist-2", refund_status: "completed" },
    ]);
    expect((await dons())[0]!.status).toBe("refunded");
    expect((await events())[0]!.void_reason).toBe("refunded");
  });
});

describe("process_refund — a commission the commissions cron claims mid-refund", () => {
  async function seed_referred_dist(donation_id: string, npo_id: number) {
    const db = test_db.current!.db;
    await db
      .update(npos)
      .set({ liq: 100, referral_id: "NPO-REF" })
      .where(eq(npos.id, npo_id));
    await db.insert(dists).values({
      id: `dist-${donation_id}`,
      donation_id,
      status: "settled",
      date_created: "2026-07-01T00:00:00.000Z",
      to_id: npo_id,
      to_name: "npo",
      amount: 100,
      amount_denom: "USD",
      net: 100,
      fee_base: 0,
      fee_fsa: 0,
      fee_processing: 0,
      alloc: { liq: 100, lock: 0, cash: 0 },
    });
    await db.insert(referrer_commissions).values({
      referrer_npo: "NPO-REF",
      date: "2026-07-01T00:00:00.000Z",
      donation_id: `dist-${donation_id}`,
      npo_id,
      amount: 5,
      status: "pending",
    });
  }

  test("a commission claimed for a Wise transfer is refunded as a loss and alerted", async () => {
    const { id, npo_id } = await seed({ event: false });
    await seed_referred_dist(id, npo_id);
    const db = test_db.current!.db;
    const graphs = await dists_for_refund(id);
    // the cron commits its claim after the caller's snapshot
    await db
      .update(referrer_commissions)
      .set({ status: "processing", ref: "ref-1" })
      .where(eq(referrer_commissions.donation_id, `dist-${id}`));

    const res = await process_refund(id, graphs, ctx);

    expect(res.failures).toEqual([]);
    const [comm] = await db.select().from(referrer_commissions);
    expect(comm!.status).toBe("refunded_loss");
    // the npo's side reverses in full; only the commission is lost
    const [dist] = await db.select().from(dists);
    expect(dist!.refund_status).toBe("completed");
    expect((await dons())[0]!.status).toBe("refunded");
    expect(res.loss_msgs).toEqual([
      expect.stringContaining(`commission dist-${id}: $5`),
    ]);
    expect(res.loss_msgs[0]).toContain("ref-1");
    expect(fiat_alert).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("ref-1") })
    );
  });

  test("a commission already paid to its referrer stays paid and is alerted as the platform's loss", async () => {
    const { id, npo_id } = await seed({ event: false });
    await seed_referred_dist(id, npo_id);
    const db = test_db.current!.db;
    await db
      .update(referrer_commissions)
      .set({ status: "paid", ref: "ref-1" })
      .where(eq(referrer_commissions.donation_id, `dist-${id}`));

    const res = await process_refund(id, await dists_for_refund(id), ctx);

    expect(res.failures).toEqual([]);
    const [comm] = await db.select().from(referrer_commissions);
    expect(comm!.status).toBe("paid");
    expect(await db.select().from(loss_logs)).toEqual([]);
    const [dist] = await db.select().from(dists);
    expect(dist!.refund_status).toBe("completed");
    expect((await dons())[0]!.status).toBe("refunded");
    expect(res.loss_msgs).toEqual([
      expect.stringContaining(`commission dist-${id}: $5`),
    ]);
    expect(fiat_alert).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("the platform's loss"),
      })
    );
  });

  /** one cash dist whose payout is in flight, refunded as a loss, then that payout's transfer goes unfunded */
  async function refund_then_unfund(commission: {
    status: "pending" | "processing" | "paid";
    ref: string | null;
  }) {
    const { id, npo_id } = await seed({ event: false });
    const db = test_db.current!.db;
    await db
      .update(npos)
      .set({ cash: 100, referral_id: "NPO-REF" })
      .where(eq(npos.id, npo_id));
    await db.insert(dists).values({
      id: "dist-1",
      donation_id: id,
      status: "settled",
      date_created: "2026-07-01T00:00:00.000Z",
      to_id: npo_id,
      to_name: "npo",
      amount: 100,
      amount_denom: "USD",
      net: 100,
      fee_base: 0,
      fee_fsa: 0,
      fee_processing: 0,
      alloc: { liq: 0, lock: 0, cash: 100 },
    });
    await db.insert(payouts).values({
      id: "payout-1",
      source_id: "dist-1",
      npo_id,
      source: "donation",
      date: "2026-07-01T00:00:00.000Z",
      amount: 100,
      type: "processing",
    });
    await db.insert(referrer_commissions).values({
      referrer_npo: "NPO-REF",
      date: "2026-07-01T00:00:00.000Z",
      donation_id: "dist-1",
      npo_id,
      amount: 5,
      ...commission,
    });
    await process_refund(id, await dists_for_refund(id), ctx);
    const [refunded] = await db.select().from(referrer_commissions);

    const reversed = await db.transaction((tx) =>
      reverse_unfunded_payout_loss(as_db(tx), "payout-1")
    );

    expect(reversed).toEqual({ status: "reversed" });
    const [dist] = await db.select().from(dists);
    expect(dist!.refund_status).toBe("completed");
    const [comm] = await db.select().from(referrer_commissions);
    return { after_refund: refunded!.status, after_reversal: comm!.status };
  }

  // its payout's transfer went unfunded, but the commission's transfer is its own
  test("an unfunded payout's loss reversal leaves a commission claimed for a transfer refunded_loss", async () => {
    const res = await refund_then_unfund({
      status: "processing",
      ref: "ref-1",
    });

    expect(res).toEqual({
      after_refund: "refunded_loss",
      after_reversal: "refunded_loss",
    });
  });

  // its loss came only from the npo's payout, which the reversal undoes
  test("an unfunded payout's loss reversal returns an unclaimed commission to refunded", async () => {
    const res = await refund_then_unfund({ status: "pending", ref: null });

    expect(res).toEqual({
      after_refund: "refunded_loss",
      after_reversal: "refunded",
    });
  });

  // the referrer keeps it either way, and it was never a loss_logs row
  test("an unfunded payout's loss reversal leaves a paid commission paid", async () => {
    const res = await refund_then_unfund({ status: "paid", ref: "ref-1" });

    expect(res).toEqual({ after_refund: "paid", after_reversal: "paid" });
    expect(await test_db.current!.db.select().from(loss_logs)).toEqual([]);
  });
});
