import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import { user } from "../schema/auth";
import { donations } from "../schema/donation";
import { npos } from "../schema/npo";
import { owed_amounts } from "../schema/owed";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import type { DbOrTx } from "./helpers";
import {
  credit_owed,
  type OwedParty,
  owed_for_donation,
  record_owed,
  recover_owed,
} from "./owed";

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which these queries do not read
const as_db = (x: unknown) => x as DbOrTx;

const DON = "don-1";
const NOW = "2026-10-04T12:00:00.000Z";

let t: TestDb;
let npo_a: number;

beforeAll(async () => {
  t = await create_test_db();
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

beforeEach(async () => {
  await t.db.delete(owed_amounts);
  await t.db.delete(donations);
  await t.db.delete(npos);
  await t.db.delete(user);
  npo_a = (await seed_npo(t.db, { registration_number: "EIN-A" }))!.id;
  await t.db.insert(donations).values({
    id: DON,
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
});

/** the $100 card gift of the ticket: $90 net to the npo, $3.20 card fee */
const refund_of = (npo_id: number, received_usd = 90) => ({
  donation_id: DON,
  party: { npo_id },
  source: "refund" as const,
  source_ref: "re_1",
  received_usd,
  fee_processing_usd: 3.2,
  now: NOW,
});

test("a first record writes one row owing what the npo received plus the card fee", async () => {
  await record_owed(as_db(t.db), refund_of(npo_a));

  const rows = await owed_for_donation(DON, as_db(t.db));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    donation_id: DON,
    npo_id: npo_a,
    referrer_user: null,
    referrer_npo: null,
    source: "refund",
    source_ref: "re_1",
    received_usd: 90,
    fee_processing_usd: 3.2,
    fee_dispute_usd: 0,
    credited_back_usd: 0,
    recovered_usd: 0,
    written_off_usd: 0,
    outstanding_usd: 93.2,
    recorded_at: NOW,
  });
});

test("recording the same figure again leaves the one row as it was", async () => {
  const first = await record_owed(as_db(t.db), refund_of(npo_a));
  await record_owed(as_db(t.db), {
    ...refund_of(npo_a),
    now: "2026-10-05T00:00:00.000Z",
  });

  expect(await owed_for_donation(DON, as_db(t.db))).toEqual([first]);
});

test("a larger cumulative figure replaces the row's, never adds to it", async () => {
  await record_owed(as_db(t.db), refund_of(npo_a, 45));
  await record_owed(as_db(t.db), {
    ...refund_of(npo_a, 90),
    source_ref: "re_2",
    now: "2026-10-05T00:00:00.000Z",
  });

  const rows = await owed_for_donation(DON, as_db(t.db));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    received_usd: 90,
    fee_processing_usd: 3.2,
    outstanding_usd: 93.2,
    source_ref: "re_1",
    recorded_at: NOW,
  });
});

test("a refund after a partly lost dispute keeps the dispute fee and the dispute as source", async () => {
  await record_owed(as_db(t.db), {
    ...refund_of(npo_a, 25),
    source: "dispute",
    source_ref: "dp_1",
    fee_processing_usd: 2.96,
    fee_dispute_usd: 15,
  });
  await record_owed(as_db(t.db), {
    ...refund_of(npo_a, 90),
    source_ref: "re_2",
  });

  const [row] = await owed_for_donation(DON, as_db(t.db));
  expect(row).toMatchObject({
    source: "dispute",
    source_ref: "dp_1",
    received_usd: 90,
    fee_processing_usd: 3.2,
    fee_dispute_usd: 15,
    outstanding_usd: 108.2,
  });
});

test("a smaller figure arriving late leaves the larger one in place", async () => {
  const full = await record_owed(as_db(t.db), refund_of(npo_a, 90));
  await record_owed(as_db(t.db), {
    ...refund_of(npo_a, 45),
    source_ref: "re_partial",
  });

  expect(await owed_for_donation(DON, as_db(t.db))).toEqual([full]);
});

test("a gift split across three npos owes one row per npo", async () => {
  const npo_b = (await seed_npo(t.db, { registration_number: "EIN-B" }))!.id;
  const npo_c = (await seed_npo(t.db, { registration_number: "EIN-C" }))!.id;
  await record_owed(as_db(t.db), refund_of(npo_a, 30));
  await record_owed(as_db(t.db), refund_of(npo_b, 20));
  await record_owed(as_db(t.db), refund_of(npo_c, 40));

  const rows = await owed_for_donation(DON, as_db(t.db));
  expect(rows).toHaveLength(3);
  expect(rows.map((r) => [r.npo_id, r.outstanding_usd])).toEqual(
    expect.arrayContaining([
      [npo_a, 33.2],
      [npo_b, 23.2],
      [npo_c, 43.2],
    ])
  );
});

test("the gift's npo and its referrers each owe on their own row", async () => {
  const referrer = await seed_user(t.db, "ref@test.com");
  await t.db
    .update(user)
    .set({ referral_code: "REF-USER" })
    .where(eq(user.id, referrer!.id));
  await seed_npo(t.db, {
    registration_number: "EIN-R",
    referral_id: "REF-NPO",
  });
  const commission = (party: OwedParty) => ({
    ...refund_of(npo_a, 5),
    party,
    fee_processing_usd: 0,
  });

  await record_owed(as_db(t.db), refund_of(npo_a));
  await record_owed(as_db(t.db), commission({ referrer_user: "REF-USER" }));
  await record_owed(as_db(t.db), commission({ referrer_npo: "REF-NPO" }));

  const rows = await owed_for_donation(DON, as_db(t.db));
  expect(rows).toHaveLength(3);
  expect(
    rows.map((r) => [
      r.npo_id,
      r.referrer_user,
      r.referrer_npo,
      r.outstanding_usd,
    ])
  ).toEqual(
    expect.arrayContaining([
      [npo_a, null, null, 93.2],
      [null, "REF-USER", null, 5],
      [null, null, "REF-NPO", 5],
    ])
  );
});

test("crediting a row back clears what it owes", async () => {
  await record_owed(as_db(t.db), refund_of(npo_a));
  const LATER = "2026-10-06T00:00:00.000Z";

  await credit_owed(as_db(t.db), {
    donation_id: DON,
    party: { npo_id: npo_a },
    reason: "transfer_unfunded",
    ref: "payout-1",
    now: LATER,
  });

  const [row] = await owed_for_donation(DON, as_db(t.db));
  expect(row).toMatchObject({
    received_usd: 90,
    fee_processing_usd: 3.2,
    credited_back_usd: 93.2,
    credited_back_at: LATER,
    outstanding_usd: 0,
  });
});

test("crediting the same row back again keeps the first credit", async () => {
  await record_owed(as_db(t.db), refund_of(npo_a));
  const credit = {
    donation_id: DON,
    party: { npo_id: npo_a },
    reason: "transfer_unfunded" as const,
    ref: "payout-1",
  };
  const first = await credit_owed(as_db(t.db), { ...credit, now: NOW });

  await credit_owed(as_db(t.db), {
    ...credit,
    now: "2026-10-07T00:00:00.000Z",
  });

  expect(await owed_for_donation(DON, as_db(t.db))).toEqual([first]);
});

test("crediting back a share leaves the rest owed", async () => {
  await record_owed(as_db(t.db), refund_of(npo_a));

  const row = await credit_owed(as_db(t.db), {
    donation_id: DON,
    party: { npo_id: npo_a },
    usd: 60,
    reason: "payout_cancelled",
    ref: "payout-1",
    now: NOW,
  });

  expect(row).toMatchObject({ credited_back_usd: 60, outstanding_usd: 33.2 });
});

test("a row credited back after part was recovered is due that part back", async () => {
  await record_owed(as_db(t.db), refund_of(npo_a));
  // recoveries are the grant run's to write, so set here by hand
  await t.db.update(owed_amounts).set({ recovered_usd: 50, recovered_at: NOW });

  const row = await credit_owed(as_db(t.db), {
    donation_id: DON,
    party: { npo_id: npo_a },
    reason: "transfer_unfunded",
    ref: "payout-1",
    now: NOW,
  });

  expect(row).toMatchObject({ credited_back_usd: 93.2, outstanding_usd: -50 });
});

test("a row naming no party, or two, is refused", async () => {
  await seed_npo(t.db, {
    registration_number: "EIN-R",
    referral_id: "REF-NPO",
  });
  const insert = (npo_id: number | null, referrer_npo: string | null) =>
    t.client.query(
      `insert into owed_amounts (donation_id, npo_id, referrer_npo, source, source_ref, recorded_at, received_usd)
       values ($1, $2, $3, 'refund', 're_1', $4, 90)`,
      [DON, npo_id, referrer_npo, NOW]
    );

  await expect(insert(null, null)).rejects.toMatchObject({ code: "23514" });
  await expect(insert(npo_a, "REF-NPO")).rejects.toMatchObject({
    code: "23514",
  });
  await expect(insert(npo_a, null)).resolves.toMatchObject({
    affectedRows: 1,
  });
});

test("a write-off without a reason is refused", async () => {
  const admin = await seed_user(t.db, "admin@test.com");
  await record_owed(as_db(t.db), refund_of(npo_a));
  const write_off = (reason: string) =>
    t.client.query(
      `update owed_amounts set written_off_usd = 93.2, written_off_at = $1,
         write_off_reason = $2, written_off_by = $3`,
      [NOW, reason, admin!.id]
    );

  await expect(write_off("  ")).rejects.toMatchObject({ code: "23514" });
  await expect(write_off("npo closed")).resolves.toMatchObject({
    affectedRows: 1,
  });
});

test("a credit beyond what the row owes is refused", async () => {
  await record_owed(as_db(t.db), refund_of(npo_a));
  const credit = (usd: number) =>
    credit_owed(as_db(t.db), {
      donation_id: DON,
      party: { npo_id: npo_a },
      usd,
      reason: "payout_cancelled",
      ref: "payout-1",
      now: NOW,
    });

  await expect(credit(93.21)).rejects.toMatchObject({
    cause: { code: "23514" },
  });
  await expect(credit(93.2)).resolves.toMatchObject({ outstanding_usd: 0 });
});

describe("credit_owed", () => {
  const credit = (ref: string, usd?: number) =>
    credit_owed(as_db(t.db), {
      donation_id: DON,
      party: { npo_id: npo_a },
      usd,
      reason: "payout_cancelled",
      ref,
      now: NOW,
    });

  test("each credit adds to what was credited before", async () => {
    await record_owed(as_db(t.db), refund_of(npo_a));

    await credit("payout-1", 30);
    const row = await credit("payout-2", 20);

    expect(row).toMatchObject({
      credited_back_usd: 50,
      credited_back_at: NOW,
      outstanding_usd: 43.2,
    });
  });

  test("crediting all after a write-off credits only what was not written off", async () => {
    const admin = await seed_user(t.db, "admin@test.com");
    await record_owed(as_db(t.db), refund_of(npo_a));
    // write-offs have no verb yet, so set here by hand
    await t.db.update(owed_amounts).set({
      written_off_usd: 20,
      written_off_at: NOW,
      write_off_reason: "npo closed",
      written_off_by: admin!.id,
    });
    await recover_owed(as_db(t.db), {
      donation_id: DON,
      party: { npo_id: npo_a },
      usd: 10,
      reason: "grant_run",
      ref: "run-1",
      now: NOW,
    });

    const row = await credit("dispute-won");

    expect(row).toMatchObject({
      credited_back_usd: 73.2,
      outstanding_usd: -10,
    });
  });

  test("a credit that with the write-off exceeds what is owed is refused", async () => {
    const admin = await seed_user(t.db, "admin@test.com");
    await record_owed(as_db(t.db), refund_of(npo_a));
    await t.db.update(owed_amounts).set({
      written_off_usd: 20,
      written_off_at: NOW,
      write_off_reason: "npo closed",
      written_off_by: admin!.id,
    });

    await expect(credit("dispute-won", 73.21)).rejects.toMatchObject({
      cause: { code: "23514" },
    });
    await expect(credit("dispute-won", 73.2)).resolves.toMatchObject({
      outstanding_usd: 0,
    });
  });

  test("a credit retried under the same ref adds nothing", async () => {
    await record_owed(as_db(t.db), refund_of(npo_a));

    const first = await credit("payout-1", 30);
    const again = await credit("payout-1", 30);

    expect(again).toEqual(first);
    expect(again).toMatchObject({ credited_back_usd: 30 });
  });
});

describe("recover_owed", () => {
  test("each run's recovery adds to the row's recovered figure", async () => {
    await record_owed(as_db(t.db), refund_of(npo_a));
    const LATER = "2026-11-01T00:00:00.000Z";
    const recover = (ref: string, usd: number, now: string) =>
      recover_owed(as_db(t.db), {
        donation_id: DON,
        party: { npo_id: npo_a },
        usd,
        reason: "grant_run",
        ref,
        now,
      });

    await recover("run-1", 80, NOW);
    const row = await recover("run-2", 13.2, LATER);

    expect(row).toMatchObject({
      recovered_usd: 93.2,
      recovered_at: LATER,
      outstanding_usd: 0,
    });
  });
});
