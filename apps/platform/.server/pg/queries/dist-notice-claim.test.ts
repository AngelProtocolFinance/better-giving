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

import { eq } from "drizzle-orm";
import { dists } from "../schema/dist";
import { donations } from "../schema/donation";
import { create_test_db } from "../test-utils/pglite";
import {
  claim_dist_notice,
  DIST_NOTICE_LEASE_MS,
  mark_dist_notice_sent,
  release_dist_notice,
} from "./dist";

const DIST_ID = "dist-1";

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
  await db.insert(donations).values({
    id: "don-1",
    upusd: 1,
    status: "settled",
    amount_base: 50,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
  await db.insert(dists).values({
    id: DIST_ID,
    donation_id: "don-1",
    status: "settled",
    date_created: new Date().toISOString(),
    amount_denom: "USD",
  });
});

const notice_of = async (id = DIST_ID) => {
  const [row] = await test_db
    .current!.db.select({
      claimed: dists.notice_claimed_at,
      sent: dists.notice_sent_at,
    })
    .from(dists)
    .where(eq(dists.id, id));
  return row!;
};

test("the first claim wins and a redelivery's claim loses", async () => {
  expect(await claim_dist_notice(DIST_ID)).toBe(true);
  expect(await claim_dist_notice(DIST_ID)).toBe(false);
  expect((await notice_of()).claimed).not.toBeNull();
});

test("a holder that releases after a throw lets the redelivery claim", async () => {
  expect(await claim_dist_notice(DIST_ID)).toBe(true);
  await release_dist_notice(DIST_ID);
  expect((await notice_of()).claimed).toBeNull();
  expect(await claim_dist_notice(DIST_ID)).toBe(true);
});

test("a sent notice is never claimed again, even by a release that comes late", async () => {
  expect(await claim_dist_notice(DIST_ID)).toBe(true);
  await mark_dist_notice_sent(DIST_ID);
  await release_dist_notice(DIST_ID);
  expect(await claim_dist_notice(DIST_ID)).toBe(false);
  expect((await notice_of()).sent).not.toBeNull();
});

test("a claim whose holder died expires after the lease", async () => {
  const { db } = test_db.current!;
  const stale = new Date(Date.now() - DIST_NOTICE_LEASE_MS - 1000);
  await db
    .update(dists)
    .set({ notice_claimed_at: stale.toISOString() })
    .where(eq(dists.id, DIST_ID));
  expect(await claim_dist_notice(DIST_ID)).toBe(true);
});

test("a dist refunded before its notice ran is not claimed", async () => {
  const { db } = test_db.current!;
  await db
    .update(dists)
    .set({ status: "refunded" })
    .where(eq(dists.id, DIST_ID));
  expect(await claim_dist_notice(DIST_ID)).toBe(false);
});
