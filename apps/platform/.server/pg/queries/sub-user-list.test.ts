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

import { npos } from "../schema/npo";
import { subscriptions } from "../schema/subscription";
import { create_test_db } from "../test-utils/pglite";
import { sub_user_list } from "./subscription";

let npo_id: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  const { db } = test_db.current!;
  await db.delete(subscriptions);
  await db.delete(npos);
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-SUBS",
      name: "Subs NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      active: true,
    })
    .returning();
  npo_id = npo!.id;
});

const seed_sub = (id: string, from_id: string, status: "active" | "inactive") =>
  test_db.current!.db.insert(subscriptions).values({
    id,
    interval: "month",
    interval_count: 1,
    next_billing: new Date().toISOString(),
    amount: 10,
    amount_usd: 10,
    currency: "USD",
    product_id: "prod",
    to_npo_id: npo_id,
    to_name: "Subs NPO",
    platform: "stripe",
    status,
    from_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

test("lists the donor's gifts whatever case their stored email is in", async () => {
  await seed_sub("sub-a", "Donor@Example.com", "active");
  await seed_sub("sub-b", "donor@example.com", "inactive");
  await seed_sub("sub-c", "other@example.com", "active");

  const rows = await sub_user_list("DONOR@example.COM");
  expect(rows.map((r) => r.id).sort()).toEqual(["sub-a", "sub-b"]);
});

test("keeps the status filter under the case-insensitive match", async () => {
  await seed_sub("sub-a", "Donor@Example.com", "active");
  await seed_sub("sub-b", "donor@example.com", "inactive");

  const rows = await sub_user_list("donor@example.com", "active");
  expect(rows.map((r) => r.id)).toEqual(["sub-a"]);
});

test("a lower(from_id) predicate is served by the expression index", async () => {
  const { client } = test_db.current!;
  await client.exec("SET enable_seqscan = off");
  try {
    const plan = await client.query<{ "QUERY PLAN": string }>(
      `EXPLAIN SELECT * FROM subscriptions WHERE lower(from_id) = lower($1) ORDER BY created_at DESC`,
      ["donor@example.com"]
    );
    const text = plan.rows.map((r) => r["QUERY PLAN"]).join("\n");
    expect(text).toContain("subscriptions_from_id_lower_status_idx");
  } finally {
    await client.exec("RESET enable_seqscan");
  }
});
