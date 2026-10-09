import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { IDonation } from "@/donations";
import { donations } from "../schema/donation";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import { donation_put } from "./donation";
import type { DbOrTx } from "./helpers";

// pglite's drizzle handle differs from neon's only in the result-type HKT
const as_db = (x: unknown) => x as DbOrTx;

let test_db: TestDb;

beforeAll(async () => {
  test_db = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

const now = new Date().toISOString();
const don = (id: string): IDonation => ({
  id,
  upusd: 1,
  status: "intent",
  amount: { base: 100, tip: 0, fee_allowance: 0 },
  currency: "USD",
  frequency: "one-time",
  source: "bg-widget",
  via: "stripe",
  // no npo with this id: the recipient insert fails its foreign key
  to_id: "999999",
  to_name: "Missing NPO",
  to_type: "npo",
  to_tip_allowed: false,
  to_members: [],
  from_email: "donor@test.com",
  created_at: now,
  updated_at: now,
});

const rows_of = (id: string) =>
  test_db.db.select().from(donations).where(eq(donations.id, id));

describe("donation_put", () => {
  test("on the bare db, a failed subtable insert leaves no donations row", async () => {
    await expect(
      donation_put(as_db(test_db.db), don("atomic-bare"))
    ).rejects.toThrow();

    expect(await rows_of("atomic-bare")).toHaveLength(0);
  });

  test("inside a caller's transaction, a failure rolls back only its own writes", async () => {
    const seen = await test_db.db.transaction(async (tx) => {
      await donation_put(as_db(tx), don("atomic-nested")).catch(() => {});
      return tx
        .select()
        .from(donations)
        .where(eq(donations.id, "atomic-nested"));
    });

    expect(seen).toHaveLength(0);
  });
});
