import { afterAll, beforeAll, expect, test } from "vitest";
import { seed_npo } from "#/__tests__/fixtures/funds";
import { create_test_db, type TestDb } from "../test-utils/pglite";

// 0045 adds subscriptions.cancel_requested_at — the subs already there come
// through it untouched, with no cancel recorded
let t: TestDb;

beforeAll(async () => {
  t = await create_test_db({ stop_before: "0045" });
  const npo = (await seed_npo(t.db, { registration_number: "EIN-A" }))!.id;
  await t.client.query(
    `insert into subscriptions (id, interval, interval_count, next_billing, amount, amount_usd, currency,
       product_id, to_npo_id, to_name, platform, status, status_cancel_reason, from_id, created_at, updated_at)
     values ('sub-a', 'month', 1, '2026-10-01T00:00:00Z', 10, 10, 'USD', 'prod', $1, 'A', 'stripe',
             'inactive', 'donor cancelled', 'ada@test.com', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z')`,
    [npo]
  );
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

test("adds a nullable cancel_requested_at over the subscriptions already there", async () => {
  await t.migrate_rest();

  const rows = await t.client.query(
    "select id, status, status_cancel_reason, cancel_requested_at from subscriptions"
  );
  expect(rows.rows).toEqual([
    {
      id: "sub-a",
      status: "inactive",
      status_cancel_reason: "donor cancelled",
      cancel_requested_at: null,
    },
  ]);
});
