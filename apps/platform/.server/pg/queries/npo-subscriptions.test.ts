import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { TestDb } from "../test-utils/pglite";

// --- hoisted refs ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

// --- mocks ---

// the query reads the module-level handle rather than taking one, so the
// pglite db is swapped in behind it.
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

// --- imports (after mocks) ---

import { npos } from "../schema/npo";
import { subscriptions } from "../schema/subscription";
import { create_test_db } from "../test-utils/pglite";
import { npo_subscriptions } from "./subscription";

let npo_id: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  const { db, client } = test_db.current!;
  // aggregates and json render in the session zone; a non-utc one exposes any
  // value that skips the normalizer
  await client.exec("set time zone 'America/Los_Angeles'");
  await db.delete(subscriptions);
  await db.delete(npos);
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-SUBS",
      name: "Freegan Food Foundation",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();
  npo_id = npo!.id;
});

async function seed(
  id: string,
  cols: {
    created_at: string;
    next_billing: string;
    status: "active" | "inactive";
  }
) {
  await test_db.current!.db.insert(subscriptions).values({
    id,
    interval: "month",
    interval_count: 1,
    amount: 10,
    amount_usd: 10,
    currency: "usd",
    product_id: "prod",
    to_npo_id: npo_id,
    to_name: "Freegan Food Foundation",
    platform: "stripe",
    from_id: "ada@test.com",
    updated_at: cols.created_at,
    ...cols,
  });
}

test("subscriber timestamps read back as ISO-8601 UTC", async () => {
  await seed("sub-a", {
    created_at: "2027-01-02 03:04:05.5+05:30",
    next_billing: "2027-02-01 00:00:00.123456+00",
    status: "active",
  });
  await seed("sub-b", {
    created_at: "2027-03-01 00:00:00+00",
    next_billing: "2027-01-15 08:00:00+00",
    status: "inactive",
  });

  const { items } = await npo_subscriptions(npo_id);

  expect(items).toHaveLength(1);
  const [subscriber] = items;
  expect(subscriber!.since).toBe("2027-01-01T21:34:05.500Z");
  expect(subscriber!.next_billing).toBe("2027-02-01T00:00:00.123456Z");
  expect(subscriber!.subs.map((s) => s.next_billing)).toEqual([
    "2027-02-01T00:00:00.123456Z",
    "2027-01-15T08:00:00.000Z",
  ]);
});

test("next billing is null when no subscription is active", async () => {
  await seed("sub-a", {
    created_at: "2027-01-02 00:00:00+00",
    next_billing: "2027-02-01 00:00:00+00",
    status: "inactive",
  });

  const { items } = await npo_subscriptions(npo_id);

  expect(items[0]!.next_billing).toBeNull();
});
