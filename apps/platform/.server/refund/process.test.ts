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
import { record_owed } from "../pg/queries/owed";
import { user } from "../pg/schema/auth";
import { bal_txs } from "../pg/schema/bal-tx";
import { dists } from "../pg/schema/dist";
import {
  donation_donors,
  donation_recipients,
  donations,
} from "../pg/schema/donation";
import { donation_match_events } from "../pg/schema/match";
import { npos } from "../pg/schema/npo";
import { owed_amounts } from "../pg/schema/owed";
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
const ctx = {
  form_id: null,
  program_id: null,
  alert_from: "test",
  source: "refund",
  source_ref: "re_1",
} as const;
const owed_rows = () => test_db.current!.db.select().from(owed_amounts);
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
  await test_db.current!.db.delete(owed_amounts);
  await test_db.current!.db.delete(payouts);
  await test_db.current!.db.delete(dists);
  await test_db.current!.db.delete(donation_match_events);
  await test_db.current!.db.delete(donation_donors);
  await test_db.current!.db.delete(donation_recipients);
  await test_db.current!.db.delete(donations);
  await test_db.current!.db.delete(referrer_commissions);
  await test_db.current!.db.delete(npos);
  await test_db.current!.db.delete(user);
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
  async function seed_cash_dist(
    donation_id: string,
    npo_id: number,
    gift: { amount: number; amount_usd: number | null; denom: string } = {
      amount: 100,
      amount_usd: 100,
      denom: "USD",
    }
  ) {
    const db = test_db.current!.db;
    await db.update(npos).set({ cash: 100 }).where(eq(npos.id, npo_id));
    await db.insert(dists).values({
      id: `dist-${donation_id}`,
      donation_id,
      status: "settled",
      date_created: "2026-07-01T00:00:00.000Z",
      to_id: npo_id,
      to_name: "npo",
      amount: gift.amount,
      amount_usd: gift.amount_usd,
      amount_denom: gift.denom,
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

  test("a payout settled after the graph was read ends owed by the npo", async () => {
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
    expect(await owed_rows()).toEqual([
      expect.objectContaining({
        donation_id: id,
        npo_id,
        source: "refund",
        source_ref: "re_1",
        received_usd: 100,
        outstanding_usd: 100,
      }),
    ]);
    expect(await db.select().from(loss_logs)).toEqual([]);
    // the settled payout's cash already left; nothing to take back
    const [npo] = await db.select().from(npos).where(eq(npos.id, npo_id));
    expect(npo!.cash).toBe(100);
    const [po] = await db.select().from(payouts);
    expect(po!.type).toBe("refunded_loss");
    expect((await dons())[0]!.status).toBe("refunded_loss");
  });

  test("the ops notice says the amount was recorded as owed by the npo", async () => {
    const { id, npo_id } = await seed({ event: false });
    await seed_cash_dist(id, npo_id);
    const db = test_db.current!.db;
    await db
      .update(payouts)
      .set({ type: "settled", settled_date: "2026-07-02T00:00:00.000Z" })
      .where(eq(payouts.id, `payout-${id}`));

    await process_refund(id, await dists_for_refund(id), ctx);

    expect(fiat_alert).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: "Refund Recorded as Owed",
        body: expect.stringContaining(
          `$100.00 recorded as owed by npo (npo ${npo_id})`
        ),
      })
    );
  });

  test("running the same refund twice leaves one owed row with the same figure", async () => {
    const { id, npo_id } = await seed({ event: false });
    await seed_cash_dist(id, npo_id);
    const db = test_db.current!.db;
    await db
      .update(payouts)
      .set({ type: "settled", settled_date: "2026-07-02T00:00:00.000Z" })
      .where(eq(payouts.id, `payout-${id}`));
    const graphs = await dists_for_refund(id);

    await process_refund(id, graphs, ctx);
    await process_refund(id, graphs, ctx);

    expect(await owed_rows()).toEqual([
      expect.objectContaining({ npo_id, outstanding_usd: 100 }),
    ]);
  });

  test("a fund gift split across three npos whose grants were paid owes one row per npo", async () => {
    const { id, npo_id } = await seed({ event: false });
    const db = test_db.current!.db;
    const others = await db
      .insert(npos)
      .values(
        [2, 3].map((n) => ({
          registration_number: `EIN-FUND-${n}`,
          name: `Fund NPO ${n}`,
          endow_designation: "Charity" as const,
          overview_pt: "[]",
          hq_country: "United States",
        }))
      )
      .returning();
    const members = [npo_id, ...others.map((o) => o.id)];
    for (const [i, to_id] of members.entries()) {
      await db.insert(dists).values({
        id: `dist-${i}`,
        donation_id: id,
        status: "settled",
        date_created: "2026-07-01T00:00:00.000Z",
        to_id,
        to_name: `npo ${i}`,
        amount: 50,
        amount_usd: 50,
        amount_denom: "USD",
        net: 45 + i,
        fee_base: 2,
        fee_fsa: 1,
        fee_processing: 1.5,
        alloc: { liq: 0, lock: 0, cash: 100 },
      });
      await db.insert(payouts).values({
        id: `payout-${i}`,
        source_id: `dist-${i}`,
        npo_id: to_id,
        source: "donation",
        date: "2026-07-01T00:00:00.000Z",
        amount: 45 + i,
        type: "settled",
        settled_date: "2026-07-02T00:00:00.000Z",
      });
    }

    const res = await process_refund(id, await dists_for_refund(id), ctx);

    expect(res.failures).toEqual([]);
    const rows = await owed_rows();
    expect(
      rows
        .map((r) => [r.npo_id, r.received_usd, r.fee_processing_usd])
        .sort((a, b) => a[0]! - b[0]!)
    ).toEqual([
      [members[0], 45, 1.5],
      [members[1], 46, 1.5],
      [members[2], 47, 1.5],
    ]);
  });

  // amount_usd is the pledge at the donation-time rate; the loss is what settled
  test("a non-USD gift refunded after its grant owes its settled USD and alerts it formatted", async () => {
    const { id, npo_id } = await seed({ event: false });
    await seed_cash_dist(id, npo_id, {
      amount: 50_000,
      amount_usd: 333.33,
      denom: "JPY",
    });
    const db = test_db.current!.db;
    await db
      .update(payouts)
      .set({ type: "settled", settled_date: "2026-07-02T00:00:00.000Z" })
      .where(eq(payouts.id, `payout-${id}`));
    const graphs = await dists_for_refund(id);

    const res = await process_refund(id, graphs, ctx);

    const [owed] = await owed_rows();
    expect(owed!.received_usd).toBe(100);
    expect(res.owed_msgs).toEqual([
      expect.stringContaining(
        `$100.00 recorded as owed by npo (npo ${npo_id})`
      ),
    ]);
  });

  test("a legacy dist with no USD amount owes its net", async () => {
    const { id, npo_id } = await seed({ event: false });
    await seed_cash_dist(id, npo_id, {
      amount: 110,
      amount_usd: null,
      denom: "USD",
    });
    const db = test_db.current!.db;
    await db
      .update(payouts)
      .set({ type: "settled", settled_date: "2026-07-02T00:00:00.000Z" })
      .where(eq(payouts.id, `payout-${id}`));
    const graphs = await dists_for_refund(id);

    await process_refund(id, graphs, ctx);

    const [owed] = await owed_rows();
    expect(owed!.outstanding_usd).toBe(100);
  });

  test("a payout the cron claimed for a transfer in flight ends owed by the npo", async () => {
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
    expect(await owed_rows()).toEqual([
      expect.objectContaining({ npo_id, received_usd: 100 }),
    ]);
    // the cash is on its way to the npo; the settle takes it off the balance
    const [npo] = await db.select().from(npos).where(eq(npos.id, npo_id));
    expect(npo!.cash).toBe(100);
    const [po] = await db.select().from(payouts);
    expect(po!.type).toBe("refunded_loss");
  });

  test("a savings shortfall whose pending payout the cron claims mid-refund re-plans to owing it all", async () => {
    const { id, npo_id } = await seed({ event: false });
    const db = test_db.current!.db;
    await db.update(npos).set({ liq: 10, cash: 40 }).where(eq(npos.id, npo_id));
    await db.insert(dists).values({
      id: `dist-${id}`,
      donation_id: id,
      status: "settled",
      date_created: "2026-07-01T00:00:00.000Z",
      to_id: npo_id,
      to_name: "npo",
      amount: 100,
      amount_usd: 100,
      amount_denom: "USD",
      net: 100,
      fee_base: 0,
      fee_fsa: 0,
      fee_processing: 0,
      alloc: { liq: 60, lock: 0, cash: 40 },
    });
    await db.insert(payouts).values({
      id: `payout-${id}`,
      source_id: `dist-${id}`,
      npo_id,
      source: "donation",
      date: "2026-07-01T00:00:00.000Z",
      amount: 40,
      type: "pending",
    });
    // planned against a pending payout: cancel it and take back its cash
    const graphs = await dists_for_refund(id);
    await db
      .update(payouts)
      .set({ type: "processing" })
      .where(eq(payouts.id, `payout-${id}`));

    const res = await process_refund(id, graphs, ctx);

    expect(res.failures).toEqual([]);
    const [po] = await db.select().from(payouts);
    expect(po!.type).toBe("refunded_loss");
    // the cash is in the transfer, so none of it comes back
    const [npo] = await db.select().from(npos).where(eq(npos.id, npo_id));
    expect(npo).toMatchObject({ liq: 10, cash: 40 });
    const [owed] = await owed_rows();
    expect(owed).toMatchObject({ received_usd: 100, outstanding_usd: 100 });
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
    expect(await owed_rows()).toHaveLength(0);
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

describe("reverse_unfunded_payout_loss — a refund owed while its payout was in flight, whose transfer went unfunded", () => {
  /** a $100 dist to one npo, `alloc` split, refunded while its payout is in a
   * transfer, so the npo owes it; that transfer then goes unfunded */
  async function refund_in_flight(o: {
    alloc: { liq: number; lock: number; cash: number };
    bal: { liq: number; lock_units?: number };
    fee_processing?: number;
    /** a dispute's open recorded the dist's net, card fee and this fee
     * before its loss reversed the gift */
    dispute_fee?: number;
  }) {
    const { id, npo_id } = await seed({ event: false });
    const db = test_db.current!.db;
    const cash = o.alloc.cash;
    await db
      .update(npos)
      .set({ ...o.bal, cash })
      .where(eq(npos.id, npo_id));
    await db.insert(dists).values({
      id: "dist-1",
      donation_id: id,
      status: "settled",
      date_created: "2026-07-01T00:00:00.000Z",
      to_id: npo_id,
      to_name: "npo",
      amount: 100,
      amount_usd: 100,
      amount_denom: "USD",
      net: 100,
      fee_base: 0,
      fee_fsa: 0,
      fee_processing: o.fee_processing ?? 0,
      alloc: o.alloc,
    });
    await db.insert(payouts).values({
      id: "payout-1",
      source_id: "dist-1",
      npo_id,
      source: "donation",
      date: "2026-07-01T00:00:00.000Z",
      amount: cash,
      type: "processing",
    });
    if (o.dispute_fee === undefined) {
      await process_refund(id, await dists_for_refund(id), ctx);
      return { id, npo_id };
    }
    const src = { source: "dispute", source_ref: "du_1" } as const;
    await record_owed(as_db(db), {
      donation_id: id,
      party: { npo_id },
      received_usd: 100,
      fee_processing_usd: o.fee_processing ?? 0,
      fee_dispute_usd: o.dispute_fee,
      ...src,
      now: "2026-07-02T00:00:00.000Z",
    });
    await process_refund(id, await dists_for_refund(id), { ...ctx, ...src });
    return { id, npo_id };
  }

  const unfund = () =>
    test_db.current!.db.transaction((tx) =>
      reverse_unfunded_payout_loss(as_db(tx), "payout-1")
    );

  test("clears what the npo owed: credited back, outstanding $0, refunded as if the payout had been pending", async () => {
    const { id, npo_id } = await refund_in_flight({
      alloc: { liq: 0, lock: 0, cash: 100 },
      bal: { liq: 0 },
      fee_processing: 3.2,
    });
    const [recorded] = await owed_rows();
    expect(recorded).toMatchObject({ outstanding_usd: 103.2 });

    expect(await unfund()).toEqual({ status: "reversed" });

    const [owed] = await owed_rows();
    expect(owed).toMatchObject({
      credited_back_usd: 103.2,
      outstanding_usd: 0,
    });
    expect(owed!.credited_back_at).not.toBeNull();
    const db = test_db.current!.db;
    const [po] = await db.select().from(payouts);
    expect(po!.type).toBe("refunded");
    const [npo] = await db.select().from(npos).where(eq(npos.id, npo_id));
    expect(npo!.cash).toBe(0);
    const [dist] = await db.select().from(dists);
    expect(dist!.refund_status).toBe("completed");
    const [don] = await dons();
    expect([don!.id, don!.status]).toEqual([id, "refunded"]);
  });

  test("a dispute's loss credits back only what the npo received, its card and dispute fees still owed", async () => {
    await refund_in_flight({
      alloc: { liq: 0, lock: 0, cash: 100 },
      bal: { liq: 0 },
      fee_processing: 3.2,
      dispute_fee: 15,
    });
    expect((await owed_rows())[0]).toMatchObject({ outstanding_usd: 118.2 });

    expect(await unfund()).toEqual({ status: "reversed" });

    const [owed] = await owed_rows();
    expect(owed).toMatchObject({
      credited_back_usd: 100,
      outstanding_usd: 18.2,
    });
  });

  test("a savings shortfall stays owed: the payout is cancelled, its cash taken back and credited", async () => {
    const { npo_id } = await refund_in_flight({
      alloc: { liq: 60, lock: 0, cash: 40 },
      bal: { liq: 10 },
    });

    expect(await unfund()).toEqual({ status: "owed_reduced" });

    const db = test_db.current!.db;
    const [po] = await db.select().from(payouts);
    expect(po!.type).toBe("refunded");
    const [npo] = await db.select().from(npos).where(eq(npos.id, npo_id));
    expect(npo).toMatchObject({ liq: 10, cash: 0 });
    const [owed] = await owed_rows();
    expect(owed).toMatchObject({ credited_back_usd: 40, outstanding_usd: 60 });
    expect(await db.select().from(loss_logs)).toEqual([]);
    const [dist] = await db.select().from(dists);
    expect(dist!.refund_status).toBe("loss");
    expect((await dons())[0]!.status).toBe("refunded_loss");
  });

  // what the refund would do now, had the payout been pending: the savings cover it
  test("a shortfall the savings cover by now reverses in full and clears what is owed", async () => {
    const { npo_id } = await refund_in_flight({
      alloc: { liq: 60, lock: 0, cash: 40 },
      bal: { liq: 10 },
    });
    const db = test_db.current!.db;
    await db.update(npos).set({ liq: 500 }).where(eq(npos.id, npo_id));

    expect(await unfund()).toEqual({ status: "reversed" });

    const [npo] = await db.select().from(npos).where(eq(npos.id, npo_id));
    expect(npo).toMatchObject({ liq: 440, cash: 0 });
    const [owed] = await owed_rows();
    expect(owed!.outstanding_usd).toBe(0);
  });

  test("a payout-only refund whose savings have run short since keeps the savings share owed", async () => {
    const { npo_id } = await refund_in_flight({
      alloc: { liq: 60, lock: 0, cash: 40 },
      bal: { liq: 100 },
    });
    const db = test_db.current!.db;
    await db.update(npos).set({ liq: 0 }).where(eq(npos.id, npo_id));

    expect(await unfund()).toEqual({ status: "owed_reduced" });

    const [owed] = await owed_rows();
    expect(owed).toMatchObject({ credited_back_usd: 40, outstanding_usd: 60 });
  });

  // the units it would have redeemed were priced at refund time, which nothing records
  test("a partly invested dist keeps its invested share owed, its cash credited", async () => {
    const { npo_id } = await refund_in_flight({
      alloc: { liq: 0, lock: 50, cash: 50 },
      bal: { liq: 0, lock_units: 1000 },
    });

    expect(await unfund()).toEqual({ status: "owed_reduced" });

    const db = test_db.current!.db;
    const [npo] = await db.select().from(npos).where(eq(npos.id, npo_id));
    expect(npo).toMatchObject({ lock_units: 1000, cash: 0 });
    const [owed] = await owed_rows();
    expect(owed).toMatchObject({ credited_back_usd: 50, outstanding_usd: 50 });
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

  test("a commission claimed for a Wise transfer goes refunded_loss and is owed by its referrer, alerted with the transfer's ref", async () => {
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
    expect(await owed_rows()).toEqual([
      expect.objectContaining({
        donation_id: id,
        npo_id: null,
        referrer_npo: "NPO-REF",
        received_usd: 5,
        outstanding_usd: 5,
      }),
    ]);
    // the npo's side reverses in full
    const [dist] = await db.select().from(dists);
    expect(dist!.refund_status).toBe("completed");
    expect((await dons())[0]!.status).toBe("refunded");
    expect(res.owed_msgs).toEqual([
      `$5.00 commission dist-${id} recorded as owed by referrer NPO-REF, to recover from its next commission; the gift's row for that referrer totals $5.00. claimed by the Wise transfer with customerTransactionId ref-1, so owed only if that transfer pays: if it goes unfunded, the commission run credits it back when it catches that, otherwise credit it on Amounts owed (/platform/owed)`,
    ]);
  });

  // pairs with the paid case below: the same read, no row
  test("an unpaid commission is reversed and its referrer owes nothing", async () => {
    const { id, npo_id } = await seed({ event: false });
    await seed_referred_dist(id, npo_id);
    const db = test_db.current!.db;

    const res = await process_refund(id, await dists_for_refund(id), ctx);

    expect(res.failures).toEqual([]);
    const [comm] = await db.select().from(referrer_commissions);
    expect(comm!.status).toBe("refunded");
    expect(await owed_rows()).toEqual([]);
    expect(fiat_alert).not.toHaveBeenCalled();
  });

  test("a user referrer's paid commission is owed by that user, not the gift's nonprofit", async () => {
    const { id, npo_id } = await seed({ event: false });
    await seed_referred_dist(id, npo_id);
    const db = test_db.current!.db;
    await db.insert(user).values({
      id: "u-ref",
      name: "Ref User",
      email: "ref@test.com",
      first_name: "Ref",
      last_name: "User",
      referral_code: "REF-USER",
    });
    await db
      .update(referrer_commissions)
      .set({
        referrer_npo: null,
        referrer_user: "REF-USER",
        status: "paid",
        ref: "ref-1",
      })
      .where(eq(referrer_commissions.donation_id, `dist-${id}`));

    await process_refund(id, await dists_for_refund(id), ctx);

    expect(await owed_rows()).toEqual([
      expect.objectContaining({
        donation_id: id,
        npo_id: null,
        referrer_user: "REF-USER",
        referrer_npo: null,
        received_usd: 5,
      }),
    ]);
  });

  test("a redelivered refund leaves one referrer row with the same amount", async () => {
    const { id, npo_id } = await seed({ event: false });
    await seed_referred_dist(id, npo_id);
    const db = test_db.current!.db;
    await db
      .update(referrer_commissions)
      .set({ status: "paid", ref: "ref-1" })
      .where(eq(referrer_commissions.donation_id, `dist-${id}`));
    const graphs = await dists_for_refund(id);

    await process_refund(id, graphs, ctx);
    await process_refund(id, graphs, { ...ctx, source_ref: "re_2" });

    expect(await owed_rows()).toEqual([
      expect.objectContaining({
        referrer_npo: "NPO-REF",
        source_ref: "re_1",
        received_usd: 5,
        outstanding_usd: 5,
      }),
    ]);
  });

  test("a commission already paid to its referrer stays paid and is recorded as owed by the referrer", async () => {
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
    expect(await owed_rows()).toEqual([
      expect.objectContaining({
        donation_id: id,
        npo_id: null,
        referrer_user: null,
        referrer_npo: "NPO-REF",
        source: "refund",
        source_ref: "re_1",
        received_usd: 5,
        fee_processing_usd: 0,
        outstanding_usd: 5,
      }),
    ]);
    const [dist] = await db.select().from(dists);
    expect(dist!.refund_status).toBe("completed");
    expect((await dons())[0]!.status).toBe("refunded");
    expect(fiat_alert).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: "Refund Recorded as Owed",
        body: expect.stringContaining(
          `$5.00 commission dist-${id} recorded as owed by referrer NPO-REF, to recover from its next commission; the gift's row for that referrer totals $5.00`
        ),
      })
    );
    expect(fiat_alert.mock.calls[0]![0].body).not.toContain("loss");
  });

  // one row per gift per party, so the row carries the gift's whole figure
  test("a fund gift whose two nonprofits share a referrer owes that referrer both paid commissions in one row", async () => {
    const { id, npo_id } = await seed({ event: false });
    const db = test_db.current!.db;
    const [other] = await db
      .insert(npos)
      .values({
        registration_number: "EIN-FUND-2",
        name: "Fund NPO 2",
        endow_designation: "Charity",
        overview_pt: "[]",
        hq_country: "United States",
      })
      .returning();
    await db.insert(user).values({
      id: "u-ref",
      name: "Ref User",
      email: "ref@test.com",
      first_name: "Ref",
      last_name: "User",
      referral_code: "REF-USER",
    });
    for (const [i, to_id] of [npo_id, other!.id].entries()) {
      await db.update(npos).set({ liq: 100 }).where(eq(npos.id, to_id));
      await db.insert(dists).values({
        id: `dist-${i}`,
        donation_id: id,
        status: "settled",
        date_created: "2026-07-01T00:00:00.000Z",
        to_id,
        to_name: `npo ${i}`,
        amount: 50,
        amount_denom: "USD",
        net: 50,
        fee_base: 0,
        fee_fsa: 0,
        fee_processing: 0,
        alloc: { liq: 100, lock: 0, cash: 0 },
      });
      await db.insert(referrer_commissions).values({
        referrer_user: "REF-USER",
        date: "2026-07-01T00:00:00.000Z",
        donation_id: `dist-${i}`,
        npo_id: to_id,
        amount: [5, 3][i]!,
        status: "paid",
        ref: "ref-1",
      });
    }

    const res = await process_refund(id, await dists_for_refund(id), ctx);

    expect(res.failures).toEqual([]);
    expect(await owed_rows()).toEqual([
      expect.objectContaining({
        donation_id: id,
        referrer_user: "REF-USER",
        received_usd: 8,
        outstanding_usd: 8,
      }),
    ]);
    expect(res.owed_msgs).toEqual([
      "$5.00 commission dist-0 recorded as owed by referrer REF-USER, to recover from its next commission; the gift's row for that referrer totals $5.00",
      "$3.00 commission dist-1 recorded as owed by referrer REF-USER, to recover from its next commission; the gift's row for that referrer totals $8.00",
    ]);
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

  // the referrer was paid either way, and the npo never owed it
  test("an unfunded payout's loss reversal leaves a paid commission paid and owed by its referrer", async () => {
    const res = await refund_then_unfund({ status: "paid", ref: "ref-1" });

    expect(res).toEqual({ after_refund: "paid", after_reversal: "paid" });
    expect(await test_db.current!.db.select().from(loss_logs)).toEqual([]);
    const rows = await owed_rows();
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ referrer_npo: null, outstanding_usd: 0 }),
        expect.objectContaining({
          referrer_npo: "NPO-REF",
          received_usd: 5,
          outstanding_usd: 5,
        }),
      ])
    );
  });
});
