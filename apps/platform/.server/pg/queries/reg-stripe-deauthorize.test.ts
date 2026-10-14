import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { TStatus } from "@/reg/schema";
import { registrations } from "../schema/registration";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import type { DbOrTx } from "./helpers";
import { reg_stripe_deauthorize } from "./registration";

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which this query does not read.
const as_db = (x: unknown) => x as DbOrTx;

let test_db: TestDb;

beforeAll(async () => {
  test_db = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

beforeEach(async () => {
  await test_db.db.delete(registrations);
});

const seed = (id: string, status: TStatus, acct: string) =>
  test_db.db.insert(registrations).values({
    id,
    r_id: `${id}@test.com`,
    status,
    o_stripe_account_id: acct,
  });

const acct_of = async (id: string) =>
  (
    await test_db.db
      .select({ acct: registrations.o_stripe_account_id })
      .from(registrations)
      .where(eq(registrations.id, id))
  )[0]?.acct;

test("clears the account from the registration holding it", async () => {
  await seed("r-1", "01", "acct_reg");
  expect(await reg_stripe_deauthorize("acct_reg", as_db(test_db.db))).toBe(
    "r-1"
  );
  expect(await acct_of("r-1")).toBeNull();
});

test("an account no registration holds clears nothing", async () => {
  await seed("r-1", "01", "acct_reg");
  expect(
    await reg_stripe_deauthorize("acct_unknown", as_db(test_db.db))
  ).toBeNull();
  expect(await acct_of("r-1")).toBe("acct_reg");
});

test("an approved registration keeps the account its npo now holds", async () => {
  await seed("r-1", "03", "acct_reg");
  expect(
    await reg_stripe_deauthorize("acct_reg", as_db(test_db.db))
  ).toBeNull();
  expect(await acct_of("r-1")).toBe("acct_reg");
});
