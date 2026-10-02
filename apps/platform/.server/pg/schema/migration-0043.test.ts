import { afterAll, beforeAll, expect, test } from "vitest";
import { create_test_db, type TestDb } from "../test-utils/pglite";

// rows whose notice went out under 0042's single stamp already counted their
// metric and fired their hooks — 0043 must mark those steps done, not reopen them
let t: TestDb;

beforeAll(async () => {
  t = await create_test_db({ stop_before: "0043" });
  await t.client.exec(`
    insert into donations (id, upusd, status, amount_base, amount_tip, amount_fee_allowance, currency, frequency, source, via)
      values ('don-old', 1, 'settled', 10, 0, 0, 'USD', 'one-time', 'bg-marketplace', 'stripe:card');
    insert into dists (id, donation_id, status, date_created, amount_denom, notice_sent_at)
      values ('dist-sent', 'don-old', 'settled', now(), 'USD', '2026-09-30T12:00:00Z');
    insert into dists (id, donation_id, status, date_created, amount_denom, notice_claimed_at)
      values ('dist-unsent', 'don-old', 'settled', now(), 'USD', now());
  `);
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

test("backfills the metric and hooks stamps from notice_sent_at, leaving unsent rows open", async () => {
  await t.migrate_rest();

  const r = await t.client.query<Record<string, unknown>>(
    `select id,
            metric_counted_at = notice_sent_at as counted_at_sent,
            hooks_sent_at = notice_sent_at as hooked_at_sent,
            metric_counted_at is null as counted_null,
            hooks_sent_at is null as hooked_null
       from dists order by id`
  );
  expect(r.rows).toEqual([
    {
      id: "dist-sent",
      counted_at_sent: true,
      hooked_at_sent: true,
      counted_null: false,
      hooked_null: false,
    },
    {
      id: "dist-unsent",
      counted_at_sent: null,
      hooked_at_sent: null,
      counted_null: true,
      hooked_null: true,
    },
  ]);
});
