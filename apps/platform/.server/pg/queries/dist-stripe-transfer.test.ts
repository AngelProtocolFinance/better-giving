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
import {
  dist_stripe_transfer_get,
  dist_stripe_transfer_set,
  dist_unroute,
  dists_routed_untransferred,
} from "./dist";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

const donation = (id: string) =>
  test_db.current!.db.insert(donations).values({
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

/** settlement's write: `acct` is the connected account, null for pooled */
const dist = (id: string, donation_id: string, acct: string | null) =>
  test_db.current!.db.insert(dists).values({
    id,
    donation_id,
    status: "settled",
    date_created: new Date().toISOString(),
    amount_denom: "USD",
    net: 45,
    stripe_routed_to: acct,
  });

beforeEach(async () => {
  const { db } = test_db.current!;
  await db.delete(dists);
  await db.delete(donations);
  for (const n of ["1", "2"]) {
    await donation(`don-${n}`);
    await dist(`dist-${n}`, `don-${n}`, `acct_${n}`);
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

test("lists the donation's routed dists still waiting on a transfer", async () => {
  await dist("dist-1-paid", "don-1", "acct_paid");
  await dist_stripe_transfer_set("dist-1-paid", "tr_paid");
  await dist("dist-1-pooled", "don-1", null);

  expect(await dists_routed_untransferred("don-1")).toEqual([
    { id: "dist-1", to_id: null, net: 45, stripe_routed_to: "acct_1" },
  ]);
});

test("a donation settled only the pooled way has none waiting", async () => {
  await donation("don-3");
  await dist("dist-3", "don-3", null);
  expect(await dists_routed_untransferred("don-3")).toEqual([]);
});

test("unrouting a routed dist with no transfer rebooks it pooled", async () => {
  expect(await dist_unroute("dist-1")).toBe(true);
  expect(await dists_routed_untransferred("don-1")).toEqual([]);
});

test("a dist a transfer already paid stays routed", async () => {
  await dist_stripe_transfer_set("dist-1", "tr_1");
  expect(await dist_unroute("dist-1")).toBe(false);
  expect(await dist_stripe_transfer_get("dist-1")).toBe("tr_1");
});

test("unrouting a pooled dist changes nothing", async () => {
  await donation("don-3");
  await dist("dist-3", "don-3", null);
  expect(await dist_unroute("dist-3")).toBe(false);
});
