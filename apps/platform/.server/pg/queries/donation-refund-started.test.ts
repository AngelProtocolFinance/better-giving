import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { TestDb } from "../test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

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

import { dists } from "../schema/dist";
import { donations } from "../schema/donation";
import { create_test_db } from "../test-utils/pglite";
import { donation_refund_started } from "./dist";

const CREATED = "2026-01-01T00:00:00.000Z";

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
});

async function seed_donation(id: string) {
  await test_db.current!.db.insert(donations).values({
    id,
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
    created_at: CREATED,
    updated_at: CREATED,
  });
}

// to_id stays null: nulls are distinct under the (donation_id, to_id) unique,
// so a donation takes several dists without seeding npos.
async function seed_dist(
  donation_id: string,
  status: "settled" | "refunded",
  refund_status: "completed" | "failed" | "loss" | null
) {
  await test_db.current!.db.insert(dists).values({
    id: crypto.randomUUID(),
    donation_id,
    status,
    refund_status,
    date_created: CREATED,
    to_id: null,
    amount_denom: "USD",
  });
}

test("a fully refunded dist counts, though the donation row is still settled", async () => {
  await seed_donation("don-1");
  await seed_dist("don-1", "refunded", "completed");

  expect(await donation_refund_started("don-1")).toBe(true);
});

test("a failed reversal counts, though its dist stays settled", async () => {
  await seed_donation("don-1");
  await seed_dist("don-1", "settled", null);
  await seed_dist("don-1", "settled", "failed");

  expect(await donation_refund_started("don-1")).toBe(true);
});

test("a dist reversed at a loss counts", async () => {
  await seed_donation("don-1");
  await seed_dist("don-1", "refunded", "loss");

  expect(await donation_refund_started("don-1")).toBe(true);
});

test("a donation whose dists have no refund outcome has not started one", async () => {
  await seed_donation("don-1");
  await seed_dist("don-1", "settled", null);
  await seed_dist("don-1", "settled", null);

  expect(await donation_refund_started("don-1")).toBe(false);
});

test("another donation's refund does not count", async () => {
  await seed_donation("don-1");
  await seed_donation("don-2");
  await seed_dist("don-1", "settled", null);
  await seed_dist("don-2", "refunded", "completed");

  expect(await donation_refund_started("don-1")).toBe(false);
});
