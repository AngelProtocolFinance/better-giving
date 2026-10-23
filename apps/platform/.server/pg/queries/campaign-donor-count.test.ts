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

import { user } from "../schema/auth";
import { campaigns } from "../schema/campaign";
import { dists } from "../schema/dist";
import { donation_donors, donations } from "../schema/donation";
import { npos } from "../schema/npo";
import { create_test_db } from "../test-utils/pglite";
import { campaign_donor_count, campaign_donor_counts } from "./campaign";

let npo_id: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
  const { db } = test_db.current;
  await db.insert(user).values({
    id: "user-cmp-count",
    name: "Ada Admin",
    email: "ada-cmp-count@test.com",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    first_name: "Ada",
    last_name: "Admin",
  });
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-CMP-DONOR-COUNT",
      name: "Acme",
      slug: "acme",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      active: true,
    })
    .returning({ id: npos.id });
  npo_id = npo!.id;
  await db.insert(campaigns).values(
    ["cmp-a", "cmp-b", "cmp-quiet"].map((id) => ({
      id,
      owner_npo_id: npo_id,
      creator_id: "user-cmp-count",
      name: id,
      slug: id,
      status: "live" as const,
    }))
  );
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  const { db } = test_db.current!;
  await db.delete(dists);
  await db.delete(donation_donors);
  await db.delete(donations);
});

/** one settled gift from `email` to the campaign, as a single dist to the org */
async function seed_gift(
  id: string,
  email: string,
  campaign_id: string,
  dist_status: "settled" | "refunded" | "refunded_loss" = "settled"
) {
  const { db } = test_db.current!;
  await db.insert(donations).values({
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
    campaign_id,
  });
  await db.insert(donation_donors).values({ donation_id: id, email });
  await db.insert(dists).values({
    id: `${id}-dist`,
    donation_id: id,
    status: dist_status,
    date_created: new Date().toISOString(),
    to_id: npo_id,
    amount_denom: "USD",
  });
}

test("refunded and refunded_loss gifts don't count", async () => {
  await seed_gift("don-1", "jane@x.com", "cmp-a");
  await seed_gift("don-2", "bob@x.com", "cmp-a", "refunded");
  await seed_gift("don-3", "carol@x.com", "cmp-a", "refunded_loss");
  expect(await campaign_donor_count("cmp-a")).toBe(1);
});

test("email as stored, like the org's count: case variants are two donors", async () => {
  await seed_gift("don-1", "jane@x.com", "cmp-a");
  await seed_gift("don-2", "Jane@x.com", "cmp-a");
  await seed_gift("don-3", "jane@x.com", "cmp-a");
  expect(await campaign_donor_count("cmp-a")).toBe(2);
});

test("counts every campaign's donors in one call", async () => {
  await seed_gift("don-1", "jane@x.com", "cmp-a");
  await seed_gift("don-2", "bob@x.com", "cmp-a");
  await seed_gift("don-3", "jane@x.com", "cmp-b");
  const counts = await campaign_donor_counts(["cmp-a", "cmp-b"]);
  expect([...counts]).toEqual([
    ["cmp-a", 2],
    ["cmp-b", 1],
  ]);
});

test("a campaign with no gifts counts zero beside one with gifts", async () => {
  await seed_gift("don-1", "jane@x.com", "cmp-a");
  const counts = await campaign_donor_counts(["cmp-a", "cmp-quiet"]);
  expect(counts.get("cmp-quiet")).toBe(0);
  expect(counts.get("cmp-a")).toBe(1);
});

test("a refunded gift doesn't count toward its campaign", async () => {
  await seed_gift("don-1", "jane@x.com", "cmp-a");
  await seed_gift("don-2", "bob@x.com", "cmp-a", "refunded");
  await seed_gift("don-3", "carol@x.com", "cmp-b", "refunded");
  const counts = await campaign_donor_counts(["cmp-a", "cmp-b"]);
  expect([...counts]).toEqual([
    ["cmp-a", 1],
    ["cmp-b", 0],
  ]);
});

test("no campaigns in, an empty map out without touching the db", async () => {
  const live = test_db.current;
  test_db.current = null; // the db proxy throws on any access
  try {
    expect(await campaign_donor_counts([])).toEqual(new Map());
  } finally {
    test_db.current = live;
  }
});
