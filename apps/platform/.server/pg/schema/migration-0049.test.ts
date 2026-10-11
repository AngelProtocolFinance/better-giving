import { afterAll, beforeAll, expect, test } from "vitest";
import { seed_npo } from "#/__tests__/fixtures/funds";
import { create_test_db, type TestDb } from "../test-utils/pglite";

// 0049 lets an owed entry be a repay. the entries already there come through
// it untouched
let t: TestDb;
const NOW = "2026-10-04T12:00:00.000Z";

const entry = (id: string, kind: string) =>
  t.client.query(
    `insert into owed_entries (id, owed_id, kind, usd, reason, ref, at)
     values ($1, 'owed-1', $2, 10, 'grant_run', $1, $3)`,
    [id, kind, NOW]
  );

beforeAll(async () => {
  t = await create_test_db({ stop_before: "0049" });
  const npo = (await seed_npo(t.db, { registration_number: "EIN-A" }))!.id;
  await t.client.query(
    `insert into donations (id, upusd, status, amount_base, amount_tip, amount_fee_allowance, currency, frequency, source, via)
     values ('don-1', 1, 'settled', 100, 0, 0, 'USD', 'one-time', 'bg-marketplace', 'stripe:card')`
  );
  await t.client.query(
    `insert into owed_amounts (id, donation_id, npo_id, source, source_ref, recorded_at, received_usd, recovered_usd, recovered_at)
     values ('owed-1', 'don-1', $1, 'refund', 're_1', $2, 90, 10, $2)`,
    [npo, NOW]
  );
  await entry("run-1", "recover");
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

test("an entry is not a repay before it", async () => {
  await expect(entry("run-2", "repay")).rejects.toMatchObject({
    code: "23514",
  });
});

test("keeps the entries already there, and takes a repay after it", async () => {
  await t.migrate_rest();

  await entry("run-2", "repay");

  const rows = await t.client.query(
    "select ref, kind from owed_entries order by ref"
  );
  expect(rows.rows).toEqual([
    { ref: "run-1", kind: "recover" },
    { ref: "run-2", kind: "repay" },
  ]);
});

test("an entry of no known kind is still refused", async () => {
  await expect(entry("run-3", "refund")).rejects.toMatchObject({
    code: "23514",
  });
});
