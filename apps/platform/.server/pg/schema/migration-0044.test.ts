import { afterAll, beforeAll, expect, test, vi } from "vitest";
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

import { claim_dist_notice } from "../queries/dist";
import { create_test_db } from "../test-utils/pglite";

// a dist settled before the per-step stamps existed already had its notice,
// metric and hooks — 0044 must close it so a replayed don-dist claims nothing
beforeAll(async () => {
  const t = await create_test_db({ stop_before: "0044" });
  test_db.current = t;
  await t.client.exec(`
    insert into donations (id, upusd, status, amount_base, amount_tip, amount_fee_allowance, currency, frequency, source, via)
      values ('don-old', 1, 'settled', 10, 0, 0, 'USD', 'one-time', 'bg-marketplace', 'stripe:card');
    insert into dists (id, donation_id, status, date_created, amount_denom)
      values ('dist-historical', 'don-old', 'settled', now() - interval '2 hours', 'USD');
    insert into dists (id, donation_id, status, date_created, amount_denom)
      values ('dist-fresh', 'don-old', 'settled', now() - interval '5 minutes', 'USD');
    insert into dists (id, donation_id, status, date_created, amount_denom, notice_sent_at, metric_counted_at, hooks_sent_at)
      values ('dist-done', 'don-old', 'settled', now(), 'USD', '2026-09-30T12:00:00Z', '2026-09-30T12:00:01Z', '2026-09-30T12:00:02Z');
    insert into dists (id, donation_id, status, date_created, amount_denom, notice_claimed_at, notice_sent_at)
      values ('dist-inflight', 'don-old', 'settled', now(), 'USD', now(), '2026-10-01T09:00:00Z');
    insert into dists (id, donation_id, status, date_created, amount_denom)
      values ('dist-refunded', 'don-old', 'refunded', now(), 'USD');
  `);
  await t.migrate_rest();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

test("stamps every step of an unclaimed settled dist older than an hour, leaving fresh, stamped, in-flight and refunded rows as they were", async () => {
  const r = await test_db.current!.client.query<Record<string, unknown>>(
    `select id,
            to_char(notice_sent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as sent,
            to_char(metric_counted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as counted,
            to_char(hooks_sent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as hooked,
            num_nonnulls(notice_sent_at, metric_counted_at, hooks_sent_at) as stamps
       from dists order by id`
  );
  expect(r.rows).toEqual([
    {
      id: "dist-done",
      sent: "2026-09-30T12:00:00",
      counted: "2026-09-30T12:00:01",
      hooked: "2026-09-30T12:00:02",
      stamps: 3,
    },
    // settled minutes ago: its first don-dist delivery may still be queued
    {
      id: "dist-fresh",
      sent: null,
      counted: null,
      hooked: null,
      stamps: 0,
    },
    {
      id: "dist-historical",
      sent: expect.any(String),
      counted: expect.any(String),
      hooked: expect.any(String),
      stamps: 3,
    },
    // claimed under the per-step model: its missing steps are a live retry
    {
      id: "dist-inflight",
      sent: "2026-10-01T09:00:00",
      counted: null,
      hooked: null,
      stamps: 1,
    },
    {
      id: "dist-refunded",
      sent: null,
      counted: null,
      hooked: null,
      stamps: 0,
    },
  ]);
});

test("a replayed don-dist for a pre-existing settled dist claims nothing", async () => {
  expect(await claim_dist_notice("dist-historical")).toEqual({
    status: "done",
  });
});
