import { eq, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { IInput, IParts } from "@/types/donation-dist";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({
  current: null as TestDb | null,
  /** the next `db.transaction` rejects with this instead of running */
  fail_next_tx: null as Error | null,
}));
const enqueue_mock = vi.hoisted(() => vi.fn());
const report_error_mock = vi.hoisted(() => vi.fn());
const report_degraded_mock = vi.hoisted(() => vi.fn());

vi.mock("#/errors/report", () => ({
  report_error: report_error_mock,
  report_degraded: report_degraded_mock,
}));
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));
vi.mock("$/pg/db", () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        const real = test_db.current?.db;
        if (!real) throw new Error("test_db not initialized");
        const failure = test_db.fail_next_tx;
        if (prop === "transaction" && failure) {
          test_db.fail_next_tx = null;
          return () => Promise.reject(failure);
        }
        return (real as any)[prop];
      },
    }
  ),
}));

const { handle_npo } = await import("./npo");
const { reversed_statuses } = await import("@/donations/settle");
const { create_test_db } = await import("$/pg/test-utils/pglite");
const { dists } = await import("$/pg/schema/dist");
const { claim_dist_notice } = await import("$/pg/queries/dist");
const { donations } = await import("$/pg/schema/donation");
const { npos } = await import("$/pg/schema/npo");
const { payouts } = await import("$/pg/schema/payout");
const { bal_txs } = await import("$/pg/schema/bal-tx");
const { rev_logs } = await import("$/pg/schema/revenue");
const { nav_holders, nav_log_positions, nav_logs } = await import(
  "$/pg/schema/nav"
);

const db = () => test_db.current!.db;

const amt = (base: number, tip = 0, fee_allowance = 0) => ({
  base,
  tip,
  fee_allowance,
});

const parts = (overrides: Partial<IParts> = {}): IParts => ({
  amnt: amt(100),
  amnt_usd: amt(100),
  fa: amt(0),
  sttl: amt(100),
  sttl_fee: amt(0),
  sttl_fa: amt(0),
  ...overrides,
});

const DON_ID = "don-dist-1";

const make_input = (npo_id: number): IInput => ({
  id: npo_id,
  ps: parts(),
  sttl: { id: "sttl-1", date: "2026-01-01T00:00:00.000Z", currency: "USD" },
  prnt: {
    id: DON_ID,
    to_id: String(npo_id),
    to_name: "n",
    to_members: [],
    type: "npo",
  },
  source: undefined,
  program: undefined,
  nav_price: 1,
  tx: {
    currency: "USD",
    upusd: 1,
    frequency: "one-time",
    status: "settled",
    source: "bg-marketplace",
    via: "stripe:card",
    from_email: "d@e.com",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
});

let npo_id = 0;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db().delete(payouts);
  await db().delete(bal_txs);
  await db().delete(rev_logs);
  await db().delete(nav_holders);
  await db().delete(nav_logs);
  await db().delete(dists);
  await db().delete(donations);
  await db().delete(npos);

  const [npo] = await db()
    .insert(npos)
    .values({
      registration_number: "EIN-DIST-1",
      name: "Test NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      allocation: { cash: 100, liq: 0, lock: 0 },
    })
    .returning();
  npo_id = npo!.id;

  await db().insert(donations).values({
    id: DON_ID,
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
});

describe("handle_npo", () => {
  it("resends the don-dist of a settlement whose first enqueue was lost, keyed to its dist", async () => {
    enqueue_mock.mockRejectedValueOnce(new Error("qstash down"));
    await expect(handle_npo(make_input(npo_id))).rejects.toThrow(/qstash down/);
    const [dist] = await db().select().from(dists);

    await expect(handle_npo(make_input(npo_id))).resolves.toBeUndefined();

    expect(await db().select().from(dists)).toHaveLength(1);
    expect(enqueue_mock).toHaveBeenCalledTimes(2);
    const resent = enqueue_mock.mock.calls[1]!;
    expect(resent).toHaveLength(1);
    expect(resent[0]).toMatchObject({
      id: "don-dist",
      dedupe: `don.dist_${dist!.id}_${npo_id}`,
      payload: { id: dist!.id, to_id: npo_id, net: 100 },
    });
    // the notice it carries is still owed
    expect(await claim_dist_notice(dist!.id)).toMatchObject({
      status: "claimed",
    });
  });

  it("resends the stored dist's net, not one replanned from the npo's terms since", async () => {
    enqueue_mock.mockRejectedValueOnce(new Error("qstash down"));
    await expect(handle_npo(make_input(npo_id))).rejects.toThrow(/qstash down/);
    // a fiscal sponsor's fee would come out of a replanned net
    await db()
      .update(npos)
      .set({ fiscal_sponsored: true })
      .where(eq(npos.id, npo_id));

    await handle_npo(make_input(npo_id));

    const [resent] = enqueue_mock.mock.calls[1]!;
    expect(resent.payload.net).toBe(100);
  });

  it("resends neither the tip nor the lock notice, which have no send-once gate", async () => {
    await db()
      .update(npos)
      .set({ allocation: { cash: 50, liq: 0, lock: 50 } })
      .where(eq(npos.id, npo_id));
    // a lock allocation buys units at the latest nav snapshot, whose rows
    // a deferred trigger wants in one transaction
    const date = "2025-12-31T00:00:00.000Z";
    await db().transaction(async (tx) => {
      await tx.insert(nav_logs).values({
        date,
        reason: "test",
        units: 100,
        price: 1,
        price_updated: date,
      });
      await tx.insert(nav_log_positions).values({
        date,
        ticker: "CASH",
        qty: 1000,
        price: 1,
        value: 1000,
        price_date: date,
      });
    });
    const input = { ...make_input(npo_id), ps: parts({ sttl: amt(100, 10) }) };

    enqueue_mock.mockRejectedValueOnce(new Error("qstash down"));
    await expect(handle_npo(input)).rejects.toThrow(/qstash down/);
    const kinds = (call: unknown[]) =>
      call.map((m) => (m as { id: string }).id);
    expect(kinds(enqueue_mock.mock.calls[0]!)).toEqual([
      "tip-received",
      "lock-tx-created",
      "don-dist",
    ]);

    await handle_npo(input);
    expect(kinds(enqueue_mock.mock.calls[1]!)).toEqual(["don-dist"]);
  });

  it("resends a don-dist the notice claim answers done once the notice went", async () => {
    await handle_npo(make_input(npo_id));
    const [dist] = await db().select().from(dists);
    // every step stamped, as a finished notice or migration 0044 leaves it
    await db()
      .update(dists)
      .set({
        notice_sent_at: sql`now()`,
        metric_counted_at: sql`now()`,
        hooks_sent_at: sql`now()`,
      })
      .where(eq(dists.id, dist!.id));

    await handle_npo(make_input(npo_id));

    const [resent] = enqueue_mock.mock.calls[1]!;
    expect(resent.payload.id).toBe(dist!.id);
    expect(await claim_dist_notice(resent.payload.id)).toEqual({
      status: "done",
    });
  });

  it("reports the absorbed redelivery as degraded, not as a bug", async () => {
    await handle_npo(make_input(npo_id));

    await handle_npo(make_input(npo_id));
    expect(report_error_mock).not.toHaveBeenCalled();
    expect(report_degraded_mock).toHaveBeenCalledOnce();
    expect(report_degraded_mock.mock.calls[0]![1]).toMatchObject({
      donation_id: DON_ID,
      npo_id,
    });
  });

  // entry.server's handleError reports the action's throw; a report here doubles it
  it("rethrows a redelivery whose resend fails without reporting it itself", async () => {
    await handle_npo(make_input(npo_id));
    enqueue_mock.mockRejectedValueOnce(new Error("qstash down"));

    await expect(handle_npo(make_input(npo_id))).rejects.toThrow(/qstash down/);
    expect(report_error_mock).not.toHaveBeenCalled();
    expect(report_degraded_mock).not.toHaveBeenCalled();
  });

  it("rethrows a unique violation on any other constraint", async () => {
    // a second unique on the dist insert: same statement, same 23505, other name
    await db().execute(
      sql`CREATE UNIQUE INDEX test_dists_to_id_uniq ON dists (to_id)`
    );
    try {
      await db().insert(donations).values({
        id: "don-other",
        upusd: 1,
        status: "settled",
        amount_base: 100,
        amount_tip: 0,
        amount_fee_allowance: 0,
        currency: "USD",
        frequency: "one-time",
        source: "bg-marketplace",
        via: "stripe:card",
      });
      await db().insert(dists).values({
        id: "dist-other",
        donation_id: "don-other",
        status: "settled",
        date_created: "2026-01-01T00:00:00.000Z",
        to_id: npo_id,
        amount_denom: "USD",
      });

      await expect(handle_npo(make_input(npo_id))).rejects.toSatisfy(
        (e: Error) =>
          (e.cause as { constraint?: string }).constraint ===
          "test_dists_to_id_uniq"
      );
      expect(report_error_mock).not.toHaveBeenCalled();
      expect(enqueue_mock).not.toHaveBeenCalled();
    } finally {
      await db().execute(sql`DROP INDEX test_dists_to_id_uniq`);
    }
  });

  // on neon, drizzle's own rollback can fail on a dead socket and replace the
  // 23505 with an error carrying no code
  const dead_socket = () => new Error("Connection terminated unexpectedly");

  it("swallows a redelivery whose unique violation arrives without its code", async () => {
    await handle_npo(make_input(npo_id));
    enqueue_mock.mockClear();

    test_db.fail_next_tx = dead_socket();
    await expect(handle_npo(make_input(npo_id))).resolves.toBeUndefined();

    expect(report_degraded_mock).toHaveBeenCalledOnce();
    expect(enqueue_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "don-dist" })
    );
  });

  // a redelivery then finds the dist and resends what this one lost
  it("rethrows an enqueue that fails after the commit, not reporting it as settled", async () => {
    enqueue_mock.mockRejectedValueOnce(new Error("qstash down"));

    await expect(handle_npo(make_input(npo_id))).rejects.toThrow(/qstash down/);
    expect(report_error_mock).not.toHaveBeenCalled();
  });

  it("rethrows a codeless failure when nothing was settled", async () => {
    test_db.fail_next_tx = dead_socket();

    await expect(handle_npo(make_input(npo_id))).rejects.toThrow(
      /terminated unexpectedly/
    );
    expect(report_error_mock).not.toHaveBeenCalled();
  });

  it("rethrows anything that is not that unique violation", async () => {
    await expect(handle_npo(make_input(npo_id + 999))).rejects.toThrow(
      /not found/
    );
  });
});

describe("handle_npo on a donation a refund already reversed", () => {
  it.each(reversed_statuses)(
    "writes no dist and enqueues nothing when the row is %s though the payload says settled",
    async (status) => {
      await db()
        .update(donations)
        .set({ status })
        .where(eq(donations.id, DON_ID));

      await expect(handle_npo(make_input(npo_id))).resolves.toBeUndefined();
      expect(await db().select().from(dists)).toHaveLength(0);
      expect(enqueue_mock).not.toHaveBeenCalled();
      expect(report_error_mock).not.toHaveBeenCalled();
    }
  );
});
