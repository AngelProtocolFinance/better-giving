import { eq, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { npos } from "../schema/npo";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import type { DbOrTx } from "./helpers";
import { npo_get_locked } from "./npo";

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which this query does not read.
const as_db = (x: unknown) => x as DbOrTx;

let test_db: TestDb;
let npo_id: number;

beforeAll(async () => {
  test_db = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

beforeEach(async () => {
  const db = test_db.db;
  await db.delete(npos);
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-LOCKED",
      name: "Locked Read NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      liq: 250.5,
      lock_units: 7.25,
    })
    .returning();
  npo_id = npo!.id;
});

describe("npo_get_locked", () => {
  test("reads the npo's balances inside a transaction", async () => {
    const npo = await test_db.db.transaction((tx) =>
      npo_get_locked(as_db(tx), npo_id)
    );

    expect(npo).toMatchObject({ id: npo_id, liq: 250.5, lock_units: 7.25 });
  });

  test("is undefined for an npo that does not exist", async () => {
    const npo = await test_db.db.transaction((tx) =>
      npo_get_locked(as_db(tx), npo_id + 1)
    );

    expect(npo).toBeUndefined();
  });

  // a row lock stamps the locker's xid into xmax; a plain read leaves it 0
  test("holds the npo row locked by the calling transaction", async () => {
    const [row] = await test_db.db.transaction(async (tx) => {
      await npo_get_locked(as_db(tx), npo_id);
      return tx
        .select({
          xmax: sql<string>`xmax::text`,
          xid: sql<string>`pg_current_xact_id()::text`,
        })
        .from(npos)
        .where(eq(npos.id, npo_id));
    });

    expect(row!.xmax).toBe(row!.xid);
  });
});
