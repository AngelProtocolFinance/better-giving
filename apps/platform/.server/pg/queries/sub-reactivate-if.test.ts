import { eq } from "drizzle-orm";
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

import { db } from "../db";
import { npos } from "../schema/npo";
import { subscriptions } from "../schema/subscription";
import { create_test_db } from "../test-utils/pglite";
import { sub_reactivate_if, sub_update } from "./subscription";

let npo_id: number;

const SUB_ID = "sub-1";
const REASON = "refund pending";
const CANCEL_AT = "2026-09-01T00:00:00.000Z";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await db.delete(subscriptions);
  await db.delete(npos);
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-REACT",
      name: "React NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      active: true,
    })
    .returning();
  npo_id = npo!.id;
  // the row as the donor's cancel leaves it
  await db.insert(subscriptions).values({
    id: SUB_ID,
    interval: "month",
    interval_count: 1,
    next_billing: "2026-10-01T00:00:00.000Z",
    amount: 10,
    amount_usd: 10,
    currency: "USD",
    product_id: "prod",
    to_npo_id: npo_id,
    to_name: "React NPO",
    platform: "stripe",
    status: "inactive",
    status_cancel_reason: REASON,
    cancel_requested_at: CANCEL_AT,
    from_id: "donor@example.com",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: CANCEL_AT,
  });
});

const row = async () =>
  (
    await db.select().from(subscriptions).where(eq(subscriptions.id, SUB_ID))
  )[0]!;

test("restores the cancel it names though a billing update moved updated_at since", async () => {
  await sub_update(db, SUB_ID, {
    next_billing: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-09-02T00:00:00.000Z",
  });

  expect(await sub_reactivate_if(db, SUB_ID, REASON, CANCEL_AT)).toBe(true);
  const r = await row();
  expect(r.status).toBe("active");
  expect(r.status_cancel_reason).toBeNull();
  expect(r.cancel_requested_at).toBeNull();
});

test("leaves a newer cancel that reused the reason in place", async () => {
  const NEWER = "2026-09-03T00:00:00.000Z";
  await sub_update(db, SUB_ID, {
    cancel_requested_at: NEWER,
    updated_at: NEWER,
  });

  expect(await sub_reactivate_if(db, SUB_ID, REASON, CANCEL_AT)).toBe(false);
  const r = await row();
  expect(r.status).toBe("inactive");
  expect(r.cancel_requested_at).toBe(NEWER);
});
