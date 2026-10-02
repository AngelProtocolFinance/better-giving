import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { TestDb } from "../test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("../db", () => ({
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

import { eq } from "drizzle-orm";
import { donations } from "../schema/donation";
import { create_test_db } from "../test-utils/pglite";
import { donation_get, donation_hold_mark } from "./donation";

const DON_ID = "don-crypto";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  const { db } = test_db.current!;
  await db.delete(donations);
  await db.insert(donations).values({
    id: DON_ID,
    upusd: 1,
    status: "intent",
    amount_base: 0.01,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "BTC",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "crypto",
  });
});

test("the first wrong-asset deposit marks the row and reads back as a hold", async () => {
  expect(await donation_hold_mark(DON_ID, "usdttrc20")).toBe(true);

  const don = await donation_get(DON_ID);
  expect(don?.hold?.asset).toBe("USDTTRC20");
  expect(don?.hold?.at).toEqual(expect.any(String));
  expect(don?.status).toBe("intent");
});

test("a redelivered hold finds the row already marked", async () => {
  expect(await donation_hold_mark(DON_ID, "USDTTRC20")).toBe(true);
  expect(await donation_hold_mark(DON_ID, "USDTTRC20")).toBe(false);
});

test("a settled donation is not held", async () => {
  await test_db
    .current!.db.update(donations)
    .set({ status: "settled" })
    .where(eq(donations.id, DON_ID));
  expect(await donation_hold_mark(DON_ID, "USDTTRC20")).toBe(false);
  expect((await donation_get(DON_ID))?.hold).toBeUndefined();
});

test("a hold stamp never lands without the asset that arrived", async () => {
  await expect(
    test_db.current!.client.query(
      `update donations set held_at = now() where id = $1`,
      [DON_ID]
    )
  ).rejects.toThrow(/hold_pair_check/);
});
