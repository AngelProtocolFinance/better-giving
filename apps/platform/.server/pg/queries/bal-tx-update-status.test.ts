import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import type { IBalanceTx } from "@/balance-txs";
import { bal_txs } from "../schema/bal-tx";
import { npos } from "../schema/npo";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import { bal_tx_update_status } from "./bal-tx";
import type { DbOrTx } from "./helpers";

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which this query does not read.
const as_db = (x: unknown) => x as DbOrTx;

const TX_ID = "redeem-1";

let test_db: TestDb;

beforeAll(async () => {
  test_db = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

beforeEach(async () => {
  const db = test_db.db;
  await db.delete(bal_txs);
  await db.delete(npos);

  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-REDEEM",
      name: "Redeem Test NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();

  const created = "2026-09-01T00:00:00.000Z";
  const pending: IBalanceTx = {
    id: TX_ID,
    date_created: created,
    date_updated: created,
    npo_id: npo!.id,
    account: "lock",
    status: "pending",
    bal_begin: 500,
    bal_end: 400,
    amount: 200,
    amount_units: 100,
    account_other_id: null,
    account_other: "grant",
    account_other_bal_begin: null,
    account_other_bal_end: null,
  };
  await db.insert(bal_txs).values(pending);
});

async function status_of(id: string) {
  const [row] = await test_db.db
    .select({ status: bal_txs.status })
    .from(bal_txs)
    .where(eq(bal_txs.id, id));
  return row?.status;
}

describe("bal_tx_update_status", () => {
  test.each(["final", "cancelled"] as const)(
    "moves a pending tx to %s and returns the updated row",
    async (status) => {
      const won = await bal_tx_update_status(as_db(test_db.db), TX_ID, status);

      expect(won).toMatchObject({ id: TX_ID, status });
      expect(await status_of(TX_ID)).toBe(status);
    }
  );

  test("returns null for a tx that does not exist", async () => {
    expect(
      await bal_tx_update_status(as_db(test_db.db), "no-such-tx", "final")
    ).toBeNull();
  });

  test.each([
    ["final", "final"],
    ["final", "cancelled"],
    ["cancelled", "final"],
    ["cancelled", "cancelled"],
  ] as const)(
    "a tx already %s is left as is by a later %s, which returns null",
    async (first, second) => {
      await bal_tx_update_status(as_db(test_db.db), TX_ID, first);

      const won = await bal_tx_update_status(as_db(test_db.db), TX_ID, second);

      expect(won).toBeNull();
      expect(await status_of(TX_ID)).toBe(first);
    }
  );
});
