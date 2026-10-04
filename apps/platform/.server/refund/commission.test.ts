import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { DbOrTx } from "../pg/queries/helpers";
import { owed_for_donation, record_owed } from "../pg/queries/owed";
import { user } from "../pg/schema/auth";
import { dists } from "../pg/schema/dist";
import { donations } from "../pg/schema/donation";
import { npos } from "../pg/schema/npo";
import { owed_amounts, owed_entries } from "../pg/schema/owed";
import { referrer_commissions } from "../pg/schema/referrer";
import type { TestDb } from "../pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("../pg/db", () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        return (test_db.current!.db as any)[prop];
      },
    }
  ),
}));

import { create_test_db } from "../pg/test-utils/pglite";
import { credit_unfunded_commissions } from "./commission";

const as_db = (x: unknown) => x as DbOrTx;
const db = () => test_db.current!.db;
const REF = "ref-1";
let npo_id: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await db().delete(owed_entries);
  await db().delete(owed_amounts);
  await db().delete(referrer_commissions);
  await db().delete(dists);
  await db().delete(donations);
  await db().delete(npos);
  await db().delete(user);
  const [npo] = await db()
    .insert(npos)
    .values({
      registration_number: "EIN-COMM",
      name: "Commission NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      referral_id: "NPO-REF",
    })
    .returning();
  npo_id = npo!.id;
});

/** a gift refunded while transfer REF held its commission: its referrer row as the refund wrote it */
async function refunded_in_flight(gift: string, amount: number) {
  await db().insert(donations).values({
    id: gift,
    upusd: 1,
    status: "refunded",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
  await db()
    .insert(dists)
    .values({
      id: `dist-${gift}`,
      donation_id: gift,
      status: "refunded",
      date_created: "2026-07-01T00:00:00.000Z",
      to_id: npo_id,
      amount: 100,
      amount_denom: "USD",
      net: 100,
    });
  await db()
    .insert(referrer_commissions)
    .values({
      referrer_npo: "NPO-REF",
      date: "2026-07-01T00:00:00.000Z",
      donation_id: `dist-${gift}`,
      npo_id,
      amount,
      status: "refunded_loss",
      ref: REF,
    });
  await record_owed(as_db(db()), {
    donation_id: gift,
    party: { referrer_npo: "NPO-REF" },
    source: "refund",
    source_ref: "re_1",
    received_usd: amount,
    fee_processing_usd: 0,
    now: "2026-07-02T00:00:00.000Z",
  });
}

describe("credit_unfunded_commissions", () => {
  // a row's credits and write-offs never pass what it owes, so the credit
  // takes only what is left, and the ref's other gifts are credited too
  test("a partly written-off row is credited only what is left, beside the ref's other gifts", async () => {
    await refunded_in_flight("don-a", 25);
    await refunded_in_flight("don-b", 10);
    await db().insert(user).values({
      id: "u-admin",
      name: "Admin",
      email: "admin@test.com",
      first_name: "A",
      last_name: "D",
    });
    await db()
      .update(owed_amounts)
      .set({
        written_off_usd: 15,
        written_off_at: "2026-07-03T00:00:00.000Z",
        write_off_reason: "small",
        written_off_by: "u-admin",
      })
      .where(eq(owed_amounts.donation_id, "don-a"));

    await db().transaction((tx) => credit_unfunded_commissions(as_db(tx), REF));

    const [a] = await owed_for_donation("don-a", as_db(db()));
    const [b] = await owed_for_donation("don-b", as_db(db()));
    expect(a).toMatchObject({ credited_back_usd: 10, outstanding_usd: 0 });
    expect(b).toMatchObject({ credited_back_usd: 10, outstanding_usd: 0 });
  });
});
