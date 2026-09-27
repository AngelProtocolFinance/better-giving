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
import { npos } from "../schema/npo";
import { create_test_db } from "../test-utils/pglite";
import { dist_shares_of } from "./dist";

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
  await db.delete(npos);
});

async function seed_npo(registration_number: string): Promise<number> {
  const [npo] = await test_db
    .current!.db.insert(npos)
    .values({
      registration_number,
      name: registration_number,
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();
  return npo!.id;
}

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

async function seed_dist(
  donation_id: string,
  to_id: number | null,
  status: "settled" | "refunded" = "settled",
  amount = 50
) {
  await test_db.current!.db.insert(dists).values({
    id: crypto.randomUUID(),
    donation_id,
    status,
    date_created: CREATED,
    to_id,
    amount,
    amount_denom: "USD",
  });
}

test("returns every nonprofit the donation was split across and its share, refunded dists included", async () => {
  const [a, b, other] = [
    await seed_npo("EIN-A"),
    await seed_npo("EIN-B"),
    await seed_npo("EIN-OTHER"),
  ];
  await seed_donation("don-1");
  await seed_donation("don-2");
  await seed_dist("don-1", a, "settled", 25);
  await seed_dist("don-1", b, "refunded", 75);
  await seed_dist("don-2", other);

  const shares = await dist_shares_of("don-1");

  expect([...shares].sort((x, y) => x.to_id - y.to_id)).toEqual([
    { to_id: a, amount: 25 },
    { to_id: b, amount: 75 },
  ]);
});

test("skips a dist with no recipient nonprofit", async () => {
  const a = await seed_npo("EIN-A");
  await seed_donation("don-1");
  await seed_dist("don-1", a);
  await seed_dist("don-1", null);

  expect(await dist_shares_of("don-1")).toEqual([{ to_id: a, amount: 50 }]);
});

test("a donation not yet split has no nonprofits", async () => {
  const a = await seed_npo("EIN-A");
  await seed_donation("don-1");
  await seed_donation("don-2");
  await seed_dist("don-2", a);

  expect(await dist_shares_of("don-1")).toEqual([]);
});
