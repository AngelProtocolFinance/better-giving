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

import { dists } from "../schema/dist";
import { donations } from "../schema/donation";
import { create_test_db } from "../test-utils/pglite";
import { dist_stripe_transfer_get, dist_stripe_transfer_set } from "./dist";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  const { db } = test_db.current!;
  await db.delete(dists);
  await db.delete(donations);
  for (const id of ["don-1", "don-2"]) {
    await db.insert(donations).values({
      id,
      upusd: 1,
      status: "settled",
      amount_base: 50,
      amount_tip: 0,
      amount_fee_allowance: 0,
      currency: "USD",
      frequency: "one-time",
      source: "bg-marketplace",
      via: "stripe:card",
    });
    await db.insert(dists).values({
      id: `dist-${id.slice(4)}`,
      donation_id: id,
      status: "settled",
      date_created: new Date().toISOString(),
      amount_denom: "USD",
    });
  }
});

test("stores the transfer on a dist that has none", async () => {
  expect(await dist_stripe_transfer_set("dist-1", "tr_1")).toEqual({
    set: true,
  });
  expect(await dist_stripe_transfer_get("dist-1")).toBe("tr_1");
});

test("keeps the first transfer and reports it to a second", async () => {
  await dist_stripe_transfer_set("dist-1", "tr_1");
  expect(await dist_stripe_transfer_set("dist-1", "tr_2")).toEqual({
    set: false,
    existing: "tr_1",
  });
  expect(await dist_stripe_transfer_get("dist-1")).toBe("tr_1");
});

test("a transfer already paying one dist is refused on another", async () => {
  await dist_stripe_transfer_set("dist-1", "tr_1");
  await expect(
    dist_stripe_transfer_set("dist-2", "tr_1")
  ).rejects.toMatchObject({ cause: { code: "23505" } });
  expect(await dist_stripe_transfer_get("dist-2")).toBeNull();
});

test("storing a transfer on no dist throws", async () => {
  await expect(dist_stripe_transfer_set("dist-x", "tr_1")).rejects.toThrow(
    "dist dist-x not found"
  );
  expect(await dist_stripe_transfer_get("dist-x")).toBeUndefined();
});
