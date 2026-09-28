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
import type { IPayout } from "@/payouts";
import { npos } from "../schema/npo";
import { payouts, settlements } from "../schema/payout";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import type { DbOrTx } from "./helpers";
import {
  payout_get,
  payout_move_from_pending,
  pending_payouts_locked,
  processing_payouts,
} from "./payout";

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which these queries do not read.
const as_db = (x: unknown) => x as DbOrTx;

// the module-level db the unscoped readers use
const current = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({
  db: new Proxy(
    {},
    { get: (_, prop) => (current.db as Record<PropertyKey, unknown>)[prop] }
  ),
}));

let test_db: TestDb;
let npo_id: number;

beforeAll(async () => {
  test_db = await create_test_db();
  current.db = test_db.db;
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

beforeEach(async () => {
  const db = test_db.db;
  await db.delete(payouts);
  await db.delete(settlements);
  await db.delete(npos);
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-PAYOUT",
      name: "Payout Test NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();
  npo_id = npo!.id;
});

async function seed_payout(
  id: string,
  type: "pending" | "processing" | "settled" | "refunded"
) {
  if (type === "settled") {
    await test_db.db.insert(settlements).values({
      id: `sttl-${id}`,
      npo_id,
      date: "2026-09-02T00:00:00.000Z",
      amount: 100,
      status: "",
    });
  }
  await test_db.db.insert(payouts).values({
    id,
    source_id: `dist-${id}`,
    npo_id,
    source: "donation",
    date: "2026-09-01T00:00:00.000Z",
    amount: 100,
    type,
    ...(type === "settled" && {
      settled_date: "2026-09-02T00:00:00.000Z",
      settled_id: `sttl-${id}`,
    }),
  });
}

async function type_of(id: string) {
  const [row] = await test_db.db
    .select({ type: payouts.type })
    .from(payouts)
    .where(eq(payouts.id, id));
  return row?.type;
}

const to_refunded = { type: "refunded" } as Partial<Omit<IPayout, "id">>;

describe("payout_move_from_pending", () => {
  test("moves a pending payout and reports the change", async () => {
    await seed_payout("p1", "pending");

    const changed = await payout_move_from_pending(
      as_db(test_db.db),
      "p1",
      to_refunded
    );

    expect(changed).toBe(true);
    expect(await type_of("p1")).toBe("refunded");
  });

  test.each(["settled", "refunded"] as const)(
    "leaves a %s payout untouched and reports no change",
    async (type) => {
      await seed_payout("p1", type);

      const changed = await payout_move_from_pending(as_db(test_db.db), "p1", {
        type: "cancelled",
      } as Partial<Omit<IPayout, "id">>);

      expect(changed).toBe(false);
      expect(await type_of("p1")).toBe(type);
    }
  );
});

describe("pending_payouts_locked", () => {
  test("returns only the pending payouts among the ids given", async () => {
    await seed_payout("given-pending", "pending");
    await seed_payout("given-settled", "settled");
    await seed_payout("given-refunded", "refunded");
    await seed_payout("other-pending", "pending");

    const locked = await test_db.db.transaction((tx) =>
      pending_payouts_locked(as_db(tx), [
        "given-pending",
        "given-settled",
        "given-refunded",
        "missing",
      ])
    );

    expect(locked.map((p) => [p.id, p.type])).toEqual([
      ["given-pending", "pending"],
    ]);
  });

  test("locks and returns rows in id order whatever order the ids came in", async () => {
    for (const id of ["p-c", "p-a", "p-b"]) await seed_payout(id, "pending");

    const locked = await test_db.db.transaction((tx) =>
      pending_payouts_locked(as_db(tx), ["p-c", "p-a", "p-b"])
    );

    expect(locked.map((p) => p.id)).toEqual(["p-a", "p-b", "p-c"]);
  });

  // a row lock stamps the locker's xid into xmax; a plain read leaves it 0
  test("holds the returned rows locked by the calling transaction", async () => {
    await seed_payout("p1", "pending");

    const [row] = await test_db.db.transaction(async (tx) => {
      await pending_payouts_locked(as_db(tx), ["p1"]);
      return tx
        .select({
          xmax: sql<string>`xmax::text`,
          xid: sql<string>`pg_current_xact_id()::text`,
        })
        .from(payouts)
        .where(eq(payouts.id, "p1"));
    });

    expect(row!.xmax).toBe(row!.xid);
  });
});

describe("payout_get", () => {
  test("reads a processing payout as processing, not pending", async () => {
    await seed_payout("p1", "processing");

    const po = await payout_get("p1");

    expect(po?.type).toBe("processing");
  });
});

describe("processing_payouts", () => {
  test("returns every processing payout and nothing else", async () => {
    await seed_payout("p-pending", "pending");
    await seed_payout("p-proc-b", "processing");
    await seed_payout("p-settled", "settled");
    await seed_payout("p-proc-a", "processing");

    const rows = await processing_payouts();

    expect(rows.map((p) => [p.id, p.type, p.npo_id, p.date])).toEqual([
      ["p-proc-a", "processing", npo_id, "2026-09-01T00:00:00.000Z"],
      ["p-proc-b", "processing", npo_id, "2026-09-01T00:00:00.000Z"],
    ]);
  });
});
