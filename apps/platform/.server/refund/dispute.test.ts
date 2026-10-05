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
import {
  balance_of,
  clear_card_gifts,
  disputes_of,
  type IDistSeed,
  PAID_GRANT,
  seed_card_gift,
  seed_paid_commission,
} from "#/__tests__/fixtures/card-gift";
import { dists } from "../pg/schema/dist";
import { donations } from "../pg/schema/donation";
import { npos } from "../pg/schema/npo";
import { owed_amounts, owed_entries } from "../pg/schema/owed";
import { payouts } from "../pg/schema/payout";
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

import { dispute_close, dispute_open } from "../pg/queries/dispute";
import type { DbOrTx } from "../pg/queries/helpers";
import {
  owed_for_donation,
  record_owed,
  recover_owed,
} from "../pg/queries/owed";
import { create_test_db } from "../pg/test-utils/pglite";
import { dispute_opened, dispute_won } from "./dispute";
import { reverse_charge } from "./reverse";

// --- setup ---

const OPENED = "2026-10-01T12:00:00.000Z";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  const db = test_db.current!.db;
  await db.delete(owed_amounts);
  await clear_card_gifts(db);
});

const seed = (...ds: IDistSeed[]) => seed_card_gift(test_db.current!.db, ...ds);

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
    expect(await disputes_of(test_db.current!.db, id)).toMatchObject([
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

  test("flags no second dispute over a refund's row on the gift", async () => {
    const { id, npo_ids } = await seed(PAID_GRANT);
    await record_owed(test_db.current!.db as unknown as DbOrTx, {
      donation_id: id,
      party: { npo_id: npo_ids[0]! },
      source: "refund",
      source_ref: "re_1",
      received_usd: 90,
      fee_processing_usd: 3.2,
      now: OPENED,
    });

    const res = await dispute_opened(opened_on(id));

    expect(res).toMatchObject({ status: "recorded", prior_refs: [] });
  });

  test("flags a second dispute on the payment, owing nothing more for it", async () => {
    const { id } = await seed(PAID_GRANT);

    const first = await dispute_opened(opened_on(id));
    const second = await dispute_opened({
      ...opened_on(id),
      dispute_id: "du_2",
    });

    expect([first, second]).toMatchObject([
      { status: "recorded", prior_refs: [], owed_written: true },
      { status: "recorded", prior_refs: [`du_${id}`], owed_written: false },
    ]);
    expect(await owed_of(id)).toMatchObject([
      { source_ref: `du_${id}`, outstanding_usd: 108.2 },
    ]);
  });

  test("says which call put the dispute on record", async () => {
    const { id } = await seed(PAID_GRANT);

    const first = await dispute_opened(opened_on(id));
    const again = await dispute_opened(opened_on(id));

    expect([first, again]).toMatchObject([
      { status: "recorded", inserted: true, owed_written: true },
      { status: "recorded", inserted: false, owed_written: false },
    ]);
  });

  test("says it wrote what is owed when an inquiry on record escalates", async () => {
    const { id } = await seed(PAID_GRANT);
    // the inquiry, put on record with nothing owed
    await dispute_open(test_db.current!.db as unknown as DbOrTx, {
      id: `du_${id}`,
      donation_id: id,
      opened_at: OPENED,
    });

    const escalated = await dispute_opened(opened_on(id));
    const again = await dispute_opened(opened_on(id));

    expect([escalated, again]).toMatchObject([
      { status: "recorded", inserted: false, owed_written: true },
      { status: "recorded", inserted: false, owed_written: false },
    ]);
    expect(await owed_of(id)).toMatchObject([{ outstanding_usd: 108.2 }]);
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

describe("an open handled after its dispute closed", () => {
  test.each(["won", "lost", "inquiry_closed"] as const)(
    "owes nothing once closed %s",
    async (status) => {
      const { id } = await seed(PAID_GRANT);
      await dispute_close(test_db.current!.db as unknown as DbOrTx, {
        id: `du_${id}`,
        donation_id: id,
        status,
        opened_at: OPENED,
        closed_at: CLOSED,
      });

      const res = await dispute_opened(opened_on(id));

      expect(res).toEqual({
        status: "closed",
        dispute_status: status,
        inserted: false,
      });
      expect(await owed_of(id)).toEqual([]);
      expect(await disputes_of(test_db.current!.db, id)).toMatchObject([
        { status },
      ]);
    }
  );
});

describe("a dispute on a gift already reversed", () => {
  /** a gift whose money already went back to its donor */
  async function seed_refunded() {
    const gift = await seed(PAID_GRANT);
    await test_db
      .current!.db.update(donations)
      .set({ status: "refunded" })
      .where(eq(donations.id, gift.id));
    return gift;
  }

  test("is recorded open, owing nothing", async () => {
    const { id } = await seed_refunded();

    const res = await dispute_opened(opened_on(id));

    expect(res).toEqual({
      status: "already_reversed",
      donation_status: "refunded",
      inserted: true,
    });
    expect(await owed_of(id)).toEqual([]);
    expect(await disputes_of(test_db.current!.db, id)).toMatchObject([
      { id: `du_${id}`, status: "open" },
    ]);
  });

  test("is recorded won, crediting nothing", async () => {
    const { id } = await seed_refunded();

    const res = await dispute_won(won_on(id));

    expect(res).toEqual({
      status: "already_reversed",
      donation_status: "refunded",
      prior_status: null,
    });
    expect(await disputes_of(test_db.current!.db, id)).toMatchObject([
      { id: `du_${id}`, status: "won", closed_at: CLOSED },
    ]);
  });

  test("won after the dispute's own loss reversed the gift, says it was lost", async () => {
    const { id } = await seed(PAID_GRANT);
    await dispute_opened(opened_on(id));
    await dispute_close(test_db.current!.db as unknown as DbOrTx, {
      id: `du_${id}`,
      donation_id: id,
      status: "lost",
      opened_at: OPENED,
      closed_at: CLOSED,
    });
    await lose(id);

    const res = await dispute_won(won_on(id));

    expect(res).toEqual({
      status: "already_reversed",
      donation_status: "refunded_loss",
      prior_status: "lost",
    });
  });

  test("won on a gift refunded while the dispute was open, says it was open", async () => {
    const { id } = await seed_refunded();
    await dispute_opened(opened_on(id));

    const res = await dispute_won(won_on(id));

    expect(res).toMatchObject({ prior_status: "open" });
  });
});

describe("dispute_won", () => {
  test("credits back what the dispute recorded, leaving nothing outstanding", async () => {
    const { id } = await seed(PAID_GRANT);
    await dispute_opened(opened_on(id));

    await dispute_won(won_on(id));

    expect(await owed_of(id)).toMatchObject([
      { received_usd: 90, fee_dispute_usd: 15, outstanding_usd: 0 },
    ]);
    expect(await disputes_of(test_db.current!.db, id)).toMatchObject([
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
  /** a $5 commission on the gift, paid to referrer `REF-1` */
  const seed_commission = (gift: { id: string; npo_ids: number[] }) =>
    seed_paid_commission(test_db.current!.db, gift, "REF-1", 5);

  const referrer_row = async (donation_id: string) =>
    (await owed_of(donation_id)).find((o) => o.referrer_user === "REF-1");

  test("is owed by its referrer from the open", async () => {
    const gift = await seed(PAID_GRANT);
    const { id } = gift;
    await seed_commission(gift);

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
    const gift = await seed(PAID_GRANT);
    const { id } = gift;
    await seed_commission(gift);
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

describe("a dispute lost after it opened", () => {
  test.each([
    ["its payout still pending", "pending"],
    ["its share in savings", "savings"],
  ] as const)(
    "takes what the npo received plus fees once, %s at open",
    async (_, payout) => {
      const { id, npo_ids } = await seed({ ...PAID_GRANT, payout });
      const npo_id = npo_ids[0]!;
      const before = await balance_of(test_db.current!.db, npo_id);

      await dispute_opened(opened_on(id));
      const at_open = await owed_of(id);
      const res = await lose(id);

      expect(at_open).toMatchObject([{ outstanding_usd: 108.2 }]);
      expect(res.status).toBe("reversed");
      const [row] = await owed_of(id);
      const taken =
        before -
        (await balance_of(test_db.current!.db, npo_id)) +
        (row?.outstanding_usd ?? NaN);
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
