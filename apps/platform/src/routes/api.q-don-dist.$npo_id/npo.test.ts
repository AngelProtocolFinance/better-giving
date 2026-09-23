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

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const enqueue_mock = vi.hoisted(() => vi.fn());
const report_error_mock = vi.hoisted(() => vi.fn());

vi.mock("#/errors/report", () => ({ report_error: report_error_mock }));
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));
vi.mock("$/pg/db", () => ({
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

const { handle_npo } = await import("./npo");
const { reversed_statuses } = await import("@/donations/settle");
const { create_test_db } = await import("$/pg/test-utils/pglite");
const { dists } = await import("$/pg/schema/dist");
const { donations } = await import("$/pg/schema/donation");
const { npos } = await import("$/pg/schema/npo");
const { payouts } = await import("$/pg/schema/payout");

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
  it("swallows the redelivery that loses on unique(donation_id, to_id)", async () => {
    await handle_npo(make_input(npo_id));
    expect(await db().select().from(dists)).toHaveLength(1);
    expect(enqueue_mock).toHaveBeenCalledOnce();

    enqueue_mock.mockClear();

    await expect(handle_npo(make_input(npo_id))).resolves.toBeUndefined();
    expect(await db().select().from(dists)).toHaveLength(1);
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  it("reports the swallowed redelivery with its donation and npo", async () => {
    await handle_npo(make_input(npo_id));
    expect(report_error_mock).not.toHaveBeenCalled();

    await handle_npo(make_input(npo_id));
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(report_error_mock.mock.calls[0]![1]).toMatchObject({
      donation_id: DON_ID,
      npo_id,
    });
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
