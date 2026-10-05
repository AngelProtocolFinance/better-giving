import { eq, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import { user } from "../pg/schema/auth";
import { bal_txs } from "../pg/schema/bal-tx";
import { donation_disputes } from "../pg/schema/dispute";
import { dists } from "../pg/schema/dist";
import {
  donation_recipients,
  donation_settlements,
  donations,
} from "../pg/schema/donation";
import { npos } from "../pg/schema/npo";
import { owed_amounts, owed_entries } from "../pg/schema/owed";
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

vi.mock("../kit/discord", () => ({ fiat_monitor: { send_alert: vi.fn() } }));
vi.mock("../kit/queue", () => ({ enqueue: vi.fn(async () => undefined) }));
vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));

// --- imports (after mocks) ---

import { disputes_of_donation } from "../pg/queries/dispute";
import type { DbOrTx } from "../pg/queries/helpers";
import { owed_for_donation, recover_owed } from "../pg/queries/owed";
import { create_test_db } from "../pg/test-utils/pglite";
import { dispute_opened, dispute_won } from "./dispute";
import { reverse_charge } from "./reverse";

// --- setup ---

const OPENED = "2026-10-01T12:00:00.000Z";

let counter = 0;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  const db = test_db.current!.db;
  await db.delete(bal_txs);
  await db.delete(loss_logs);
  await db.delete(owed_amounts);
  await db.delete(donation_disputes);
  await db.delete(payouts);
  await db.delete(referrer_commissions);
  await db.delete(dists);
  await db.delete(donation_settlements);
  await db.delete(donation_recipients);
  await db.delete(donations);
  await db.delete(npos);
  await db.delete(user);
});

interface IDistSeed {
  /** settled usd: net + card fee + bg's fees */
  net: number;
  fee_processing: number;
  fee_base: number;
  /** the grant run's payout of the dist's cash, or `savings` for a dist
   * credited whole to the npo's savings balance, which has no payout */
  payout: "pending" | "settled" | "savings";
}

/** the ticket's $100 card gift: $90 net, $3.20 card fee, its grant paid */
const PAID_GRANT: IDistSeed = {
  net: 90,
  fee_processing: 3.2,
  fee_base: 6.8,
  payout: "settled",
};

/** a settled card gift with one cash dist per entry, each to its own npo */
async function seed(...ds: IDistSeed[]) {
  counter++;
  const db = test_db.current!.db;
  const id = `don-${counter}`;
  const gross = ds.reduce(
    (s, d) => s + d.net + d.fee_processing + d.fee_base,
    0
  );
  await db.insert(donations).values({
    id,
    upusd: 1,
    status: "settled",
    amount_base: gross,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
  await db.insert(donation_settlements).values({
    donation_id: id,
    sttl_id: `pi_${counter}`,
    date: "2026-07-01T00:00:00.000Z",
    currency: "USD",
    net: gross - 3.2,
    fee: 3.2,
  });
  const npo_ids: number[] = [];
  for (const [i, d] of ds.entries()) {
    const npo = await seed_npo(db, {
      registration_number: `EIN-DSP-${counter}-${i}`,
      name: `NPO ${counter}-${i}`,
      cash: d.payout === "pending" ? d.net : 0,
      liq: d.payout === "savings" ? d.net : 0,
    });
    npo_ids.push(npo!.id);
    const dist_id = `dist-${id}-${i}`;
    await db.insert(dists).values({
      id: dist_id,
      donation_id: id,
      status: "settled",
      date_created: "2026-07-01T00:00:00.000Z",
      to_id: npo!.id,
      to_name: npo!.name,
      amount: d.net + d.fee_processing + d.fee_base,
      amount_usd: d.net + d.fee_processing + d.fee_base,
      amount_denom: "USD",
      net: d.net,
      fee_base: d.fee_base,
      fee_fsa: 0,
      fee_processing: d.fee_processing,
      alloc:
        d.payout === "savings"
          ? { liq: 100, lock: 0, cash: 0 }
          : { liq: 0, lock: 0, cash: 100 },
    });
    if (d.payout === "savings") continue;
    await db.insert(payouts).values({
      id: `payout-${dist_id}`,
      source_id: dist_id,
      npo_id: npo!.id,
      source: "donation",
      date: "2026-07-01T00:00:00.000Z",
      amount: d.net,
      type: d.payout,
      ...(d.payout === "settled" && {
        settled_date: "2026-07-02T00:00:00.000Z",
      }),
    });
  }
  await db.insert(donation_recipients).values({
    donation_id: id,
    npo_id: npo_ids[0],
    name: "recipient",
    type: "npo",
  });
  return { id, npo_ids };
}

const opened_on = (donation_id: string, fee_usd = 15) => ({
  donation_id,
  rail: "stripe" as const,
  dispute_id: `du_${donation_id}`,
  opened_at: OPENED,
  fee_usd,
});

/** each party's row on the gift as it breaks down, npos by id, then referrers */
const owed_of = async (donation_id: string) =>
  (await owed_for_donation(donation_id))
    .sort((a, b) => (a.npo_id ?? Infinity) - (b.npo_id ?? Infinity))
    .map((o) => ({
      npo_id: o.npo_id,
      referrer_user: o.referrer_user,
      source: o.source,
      source_ref: o.source_ref,
      received_usd: o.received_usd,
      fee_processing_usd: o.fee_processing_usd,
      fee_dispute_usd: o.fee_dispute_usd,
      outstanding_usd: o.outstanding_usd,
    }));

describe("dispute_opened", () => {
  test("records what a paid-grant npo received plus its card and dispute fees as owed", async () => {
    const { id, npo_ids } = await seed(PAID_GRANT);

    await dispute_opened(opened_on(id));

    expect(await owed_of(id)).toEqual([
      {
        npo_id: npo_ids[0],
        referrer_user: null,
        source: "dispute",
        source_ref: `du_${id}`,
        received_usd: 90,
        fee_processing_usd: 3.2,
        fee_dispute_usd: 15,
        outstanding_usd: 108.2,
      },
    ]);
    expect(await disputes_of_donation(id)).toMatchObject([
      { id: `du_${id}`, status: "open", opened_at: OPENED },
    ]);
  });

  test("splits the dispute fee across a fund gift's npos by share, to the cent", async () => {
    // settled $50 and $25: a 2:1 split of $15.01 is $10.006… and $5.003…
    const { id, npo_ids } = await seed(
      { net: 45, fee_processing: 1.6, fee_base: 3.4, payout: "settled" },
      { net: 22.5, fee_processing: 0.8, fee_base: 1.7, payout: "settled" }
    );

    await dispute_opened(opened_on(id, 15.01));

    const rows = await owed_of(id);
    expect(rows.map((o) => [o.npo_id, o.fee_dispute_usd])).toEqual([
      [npo_ids[0], 10.01],
      [npo_ids[1], 5],
    ]);
    const [sum] = await test_db
      .current!.db.select({
        usd: sql<string>`sum(${owed_amounts.fee_dispute_usd})::text`,
      })
      .from(owed_amounts)
      .where(eq(owed_amounts.donation_id, id));
    expect(Number(sum?.usd)).toBe(15.01);
  });
});

const CLOSED = "2026-10-20T12:00:00.000Z";

const won_on = (donation_id: string) => ({
  donation_id,
  rail: "stripe" as const,
  dispute_id: `du_${donation_id}`,
  opened_at: OPENED,
  closed_at: CLOSED,
});

describe("dispute_won", () => {
  test("credits back what the dispute recorded, leaving nothing outstanding", async () => {
    const { id } = await seed(PAID_GRANT);
    await dispute_opened(opened_on(id));

    await dispute_won(won_on(id));

    expect(await owed_of(id)).toMatchObject([
      { received_usd: 90, fee_dispute_usd: 15, outstanding_usd: 0 },
    ]);
    expect(await disputes_of_donation(id)).toMatchObject([
      { status: "won", closed_at: CLOSED },
    ]);
  });

  test("leaves the npo due back what a grant run had already recovered", async () => {
    const { id, npo_ids } = await seed(PAID_GRANT);
    await dispute_opened(opened_on(id));
    await recover_owed(test_db.current!.db as unknown as DbOrTx, {
      donation_id: id,
      party: { npo_id: npo_ids[0]! },
      usd: 50,
      reason: "grant_run",
      ref: "run-1",
      now: OPENED,
    });

    await dispute_won(won_on(id));

    expect(await owed_of(id)).toMatchObject([{ outstanding_usd: -50 }]);
  });

  test("a redelivered open or win changes nothing further", async () => {
    const { id } = await seed(PAID_GRANT);
    const db = test_db.current!.db;

    await dispute_opened(opened_on(id));
    await dispute_opened(opened_on(id));
    const at_open = await owed_of(id);
    await dispute_won(won_on(id));
    await dispute_won(won_on(id));

    expect(at_open).toMatchObject([{ outstanding_usd: 108.2 }]);
    expect(await owed_of(id)).toMatchObject([{ outstanding_usd: 0 }]);
    expect(
      await db.select({ usd: owed_entries.usd }).from(owed_entries)
    ).toEqual([{ usd: 108.2 }]);
  });
});

describe("a paid commission on a disputed gift", () => {
  /** a $5 commission on the gift's dist, paid to referrer `REF-1` */
  async function seed_paid_commission(donation_id: string, npo_id: number) {
    const db = test_db.current!.db;
    const referrer = await seed_user(db, "referrer@test.com");
    await db
      .update(user)
      .set({ referral_code: "REF-1" })
      .where(eq(user.id, referrer!.id));
    await db.insert(referrer_commissions).values({
      referrer_user: "REF-1",
      date: "2026-07-01T00:00:00.000Z",
      donation_id: `dist-${donation_id}-0`,
      npo_id,
      amount: 5,
      status: "paid",
    });
  }

  const referrer_row = async (donation_id: string) =>
    (await owed_of(donation_id)).find((o) => o.referrer_user === "REF-1");

  test("is owed by its referrer from the open", async () => {
    const { id, npo_ids } = await seed(PAID_GRANT);
    await seed_paid_commission(id, npo_ids[0]!);

    await dispute_opened(opened_on(id));

    expect(await referrer_row(id)).toEqual({
      npo_id: null,
      referrer_user: "REF-1",
      source: "dispute",
      source_ref: `du_${id}`,
      received_usd: 5,
      fee_processing_usd: 0,
      fee_dispute_usd: 0,
      outstanding_usd: 5,
    });
  });

  test("is credited back to its referrer on a win", async () => {
    const { id, npo_ids } = await seed(PAID_GRANT);
    await seed_paid_commission(id, npo_ids[0]!);
    await dispute_opened(opened_on(id));

    await dispute_won(won_on(id));

    expect(await referrer_row(id)).toMatchObject({ outstanding_usd: 0 });
  });
});

/** the dispute closed lost: the gift reverses through the one reversal entry */
const lose = (donation_id: string) =>
  reverse_charge({
    donation_id,
    rail: "stripe",
    source: "dispute",
    source_ref: `du_${donation_id}`,
    alert_from: "charge-dispute",
    notice: { id: `evt_lost_${donation_id}`, lines: [] },
  });

/** the npo's savings and grant cash, in usd */
const balance_of = async (npo_id: number) => {
  const [row] = await test_db
    .current!.db.select({ liq: npos.liq, cash: npos.cash })
    .from(npos)
    .where(eq(npos.id, npo_id));
  return (row?.liq ?? 0) + (row?.cash ?? 0);
};

describe("a dispute lost after it opened", () => {
  test.each([
    ["its payout still pending", "pending"],
    ["its share in savings", "savings"],
  ] as const)(
    "takes what the npo received plus fees once, %s at open",
    async (_, payout) => {
      const { id, npo_ids } = await seed({ ...PAID_GRANT, payout });
      const npo_id = npo_ids[0]!;
      const before = await balance_of(npo_id);

      await dispute_opened(opened_on(id));
      const at_open = await owed_of(id);
      const res = await lose(id);

      expect(at_open).toMatchObject([{ outstanding_usd: 108.2 }]);
      expect(res.status).toBe("reversed");
      const [row] = await owed_of(id);
      const taken =
        before - (await balance_of(npo_id)) + (row?.outstanding_usd ?? NaN);
      expect(taken).toBeCloseTo(108.2, 10);
    }
  );

  test("with no open on record, owes what the loss path records", async () => {
    // half to savings the npo no longer holds, half to a pending payout the
    // reversal cancels: a loss that takes $45 back and owes the rest
    const { id, npo_ids } = await seed({ ...PAID_GRANT, payout: "pending" });
    const db = test_db.current!.db;
    await db
      .update(dists)
      .set({ alloc: { liq: 50, lock: 0, cash: 50 } })
      .where(eq(dists.donation_id, id));
    await db.update(npos).set({ cash: 45 }).where(eq(npos.id, npo_ids[0]!));
    await db
      .update(payouts)
      .set({ amount: 45 })
      .where(eq(payouts.npo_id, npo_ids[0]!));

    await lose(id);

    expect(await owed_of(id)).toMatchObject([
      { received_usd: 45, fee_processing_usd: 3.2, outstanding_usd: 48.2 },
    ]);
  });

  test("reverses a paid-grant gift, keeping the row and booking no loss", async () => {
    const { id, npo_ids } = await seed(PAID_GRANT);
    const db = test_db.current!.db;

    await dispute_opened(opened_on(id));
    const res = await lose(id);

    expect(res.status).toBe("reversed");
    const [don] = await db
      .select({ status: donations.status })
      .from(donations)
      .where(eq(donations.id, id));
    expect(don?.status).toBe("refunded_loss");
    expect(await owed_of(id)).toEqual([
      {
        npo_id: npo_ids[0],
        referrer_user: null,
        source: "dispute",
        source_ref: `du_${id}`,
        received_usd: 90,
        fee_processing_usd: 3.2,
        fee_dispute_usd: 15,
        outstanding_usd: 108.2,
      },
    ]);
    expect(await db.select().from(loss_logs)).toEqual([]);
  });
});
