import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { dists } from "../schema/dist";
import { donations } from "../schema/donation";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import { dist_refund_state_locked, dist_update } from "./dist";
import type { DbOrTx } from "./helpers";

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which these queries do not read.
const as_db = (x: unknown) => x as DbOrTx;

let t: TestDb;

beforeAll(async () => {
  t = await create_test_db();
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

beforeEach(async () => {
  await t.db.delete(dists);
  await t.db.delete(donations);
  await t.db.insert(donations).values({
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
  await t.db.insert(dists).values({
    id: "dist-1",
    donation_id: "don-1",
    status: "settled",
    date_created: new Date().toISOString(),
    amount_denom: "USD",
    net: 45,
    stripe_routed_to: "acct_1",
  });
});

const state = () =>
  t.db.transaction((tx) => dist_refund_state_locked(as_db(tx), "dist-1"));

test("a refused transfer's rebook leaves the dist pooled with its cut", async () => {
  await dist_update(as_db(t.db), "dist-1", {
    net: 30,
    stripe_routed_to: null,
    refunds_cut_share: 0.25,
  });
  expect(await state()).toEqual({
    status: "settled",
    refund_status: null,
    stripe_routed_to: null,
    refunds_cut_share: 0.25,
  });
});

test("a dist still routed reads its account, and no cut", async () => {
  expect(await state()).toMatchObject({
    stripe_routed_to: "acct_1",
    refunds_cut_share: null,
  });
});
