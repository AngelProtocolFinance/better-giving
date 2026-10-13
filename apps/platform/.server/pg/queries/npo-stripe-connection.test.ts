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
import { create_test_db } from "../test-utils/pglite";
import type { DbOrTx } from "./helpers";
import { npo_get, npo_stripe_connect, npo_stripe_deauthorize } from "./npo";

const T1 = "2026-10-13T12:00:00.000Z";
const T2 = "2026-10-13T12:05:00.000Z";

let npo_id: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  const { db } = test_db.current!;
  await db.delete(npos);
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-DEAUTH",
      name: "Deauth NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      stripe_account_id: "acct_deauth",
    })
    .returning({ id: npos.id });
  npo_id = npo!.id;
});

const deauthorized_at = async () =>
  (await npo_get(npo_id))?.stripe_deauthorized_at;

test("marks the npo holding the account, and keeps the account", async () => {
  expect(await npo_stripe_deauthorize("acct_deauth", T1)).toBe(npo_id);
  const npo = await npo_get(npo_id);
  expect(npo?.stripe_deauthorized_at).toBe(T1);
  expect(npo?.stripe_account_id).toBe("acct_deauth");
});

test("a redelivered or later event keeps the first stamp", async () => {
  await npo_stripe_deauthorize("acct_deauth", T1);
  expect(await npo_stripe_deauthorize("acct_deauth", T2)).toBe(npo_id);
  expect(await deauthorized_at()).toBe(T1);
});

test("an earlier event arriving late moves the stamp back to it", async () => {
  await npo_stripe_deauthorize("acct_deauth", T2);
  await npo_stripe_deauthorize("acct_deauth", T1);
  expect(await deauthorized_at()).toBe(T1);
});

test("an account no npo holds marks nothing", async () => {
  expect(await npo_stripe_deauthorize("acct_unknown", T1)).toBeNull();
  expect(await deauthorized_at()).toBeNull();
});

// the reset the oauth callback passes: nothing is known of a fresh account
const UNSET = {
  stripe_charges_enabled: false,
  stripe_payouts_enabled: false,
  stripe_details_submitted: false,
  stripe_requirements_due: [],
  stripe_synced_at: null,
};

// pglite's drizzle handle differs from neon's only in the result-type HKT
const tx_of = () => test_db.current!.db as unknown as DbOrTx;

test("reconnecting a disconnected npo routes it again", async () => {
  await npo_stripe_deauthorize("acct_deauth", T1);
  expect(
    await npo_stripe_connect(
      tx_of(),
      npo_id,
      "acct_deauth",
      "acct_deauth",
      UNSET
    )
  ).toBe(true);
  const npo = await npo_get(npo_id);
  expect(npo?.stripe_deauthorized_at).toBeNull();
  expect(npo?.stripe_account_id).toBe("acct_deauth");
});

test("a connect against an account the npo no longer holds writes nothing", async () => {
  expect(
    await npo_stripe_connect(tx_of(), npo_id, "acct_new", null, UNSET)
  ).toBe(false);
  expect((await npo_get(npo_id))?.stripe_account_id).toBe("acct_deauth");
});

test("the old account's readiness does not carry over", async () => {
  await test_db.current!.db.update(npos).set({
    stripe_charges_enabled: true,
    stripe_payouts_enabled: true,
    stripe_details_submitted: true,
    stripe_requirements_due: ["external_account"],
    stripe_synced_at: T1,
  });
  await npo_stripe_connect(tx_of(), npo_id, "acct_new", "acct_deauth", UNSET);
  const npo = await npo_get(npo_id);
  expect(npo).toMatchObject({
    stripe_account_id: "acct_new",
    stripe_charges_enabled: false,
    stripe_payouts_enabled: false,
    stripe_details_submitted: false,
    stripe_requirements_due: [],
    stripe_synced_at: null,
  });
});
