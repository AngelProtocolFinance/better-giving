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
import { owed_amounts, owed_entries } from "../schema/owed";
import { loss_logs } from "../schema/revenue";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import type { DbOrTx } from "./helpers";
import {
  admin_credit_owed,
  credit_owed,
  type OwedParty,
  owed_for_donation,
  owed_list,
  record_owed,
  recover_owed,
  write_off_owed,
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
  await t.db.delete(loss_logs);
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
    // a partial write-off has no verb, so set here by hand
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

describe("write_off_owed", () => {
  const write_off = (owed_id: string, actor: string, reason = "npo closed") =>
    write_off_owed(as_db(t.db), { owed_id, reason, actor, now: NOW });

  test("writes off what is still owed and books it as one loss by the admin", async () => {
    const admin = await seed_user(t.db, "admin@test.com");
    const owed = await record_owed(as_db(t.db), refund_of(npo_a));
    await recover_owed(as_db(t.db), {
      donation_id: DON,
      party: { npo_id: npo_a },
      usd: 40,
      reason: "grant_run",
      ref: "run-1",
      now: NOW,
    });
    const LATER = "2026-10-08T00:00:00.000Z";

    const row = await write_off_owed(as_db(t.db), {
      owed_id: owed.id,
      reason: "npo closed",
      actor: admin!.id,
      now: LATER,
    });

    expect(row).toMatchObject({
      recovered_usd: 40,
      written_off_usd: 53.2,
      written_off_at: LATER,
      write_off_reason: "npo closed",
      written_off_by: admin!.id,
      outstanding_usd: 0,
    });
    expect(await t.db.select().from(loss_logs)).toEqual([
      expect.objectContaining({
        date: LATER,
        donation_id: DON,
        npo_id: npo_a,
        type: "write_off",
        amount: 53.2,
        reason: "npo closed",
        actor: admin!.id,
      }),
    ]);
  });

  test("a write-off without a reason is refused and writes nothing", async () => {
    const admin = await seed_user(t.db, "admin@test.com");
    const owed = await record_owed(as_db(t.db), refund_of(npo_a));

    await expect(write_off(owed.id, admin!.id, "  ")).rejects.toMatchObject({
      cause: { code: "23514" },
    });
    expect(await owed_for_donation(DON, as_db(t.db))).toEqual([owed]);
    expect(await t.db.select().from(loss_logs)).toEqual([]);
  });

  test("a second write-off of the row adds nothing and books no second loss", async () => {
    const admin = await seed_user(t.db, "admin@test.com");
    const owed = await record_owed(as_db(t.db), refund_of(npo_a));

    const first = await write_off(owed.id, admin!.id);
    const again = await write_off(owed.id, admin!.id, "double click");

    expect(again).toEqual(first);
    expect(again).toMatchObject({
      written_off_usd: 93.2,
      write_off_reason: "npo closed",
    });
    const losses = await t.db.select().from(loss_logs);
    expect(losses).toHaveLength(1);
    expect(losses[0]).toMatchObject({ amount: 93.2, reason: "npo closed" });
  });

  test("a row that owes nothing is not written off", async () => {
    const admin = await seed_user(t.db, "admin@test.com");
    const owed = await record_owed(as_db(t.db), refund_of(npo_a));
    await credit_owed(as_db(t.db), {
      donation_id: DON,
      party: { npo_id: npo_a },
      reason: "payout_cancelled",
      ref: "payout-1",
      now: NOW,
    });

    expect(await write_off(owed.id, admin!.id)).toBeNull();
    expect(await write_off("no-such-row", admin!.id)).toBeNull();
    expect(await t.db.select().from(loss_logs)).toEqual([]);
  });

  test("a written-off row has nothing left for a grant run to recover", async () => {
    const admin = await seed_user(t.db, "admin@test.com");
    const owed = await record_owed(as_db(t.db), refund_of(npo_a));
    const recover = (ref: string, usd: number) =>
      recover_owed(as_db(t.db), {
        donation_id: DON,
        party: { npo_id: npo_a },
        usd,
        reason: "grant_run",
        ref,
        now: NOW,
      });
    await recover("run-1", 40);
    await write_off(owed.id, admin!.id);

    await expect(recover("run-2", 0.01)).rejects.toMatchObject({
      cause: { code: "23514" },
    });
    const [row] = await owed_for_donation(DON, as_db(t.db));
    expect(row).toMatchObject({ recovered_usd: 40, outstanding_usd: 0 });
  });

  test("a referrer's write-off is booked as a loss of that referrer", async () => {
    const admin = await seed_user(t.db, "admin@test.com");
    await seed_npo(t.db, {
      registration_number: "EIN-R",
      referral_id: "REF-NPO",
    });
    const owed = await record_owed(as_db(t.db), {
      ...refund_of(npo_a, 5),
      party: { referrer_npo: "REF-NPO" },
      fee_processing_usd: 0,
    });

    await write_off(owed.id, admin!.id);

    expect(await t.db.select().from(loss_logs)).toEqual([
      expect.objectContaining({
        npo_id: null,
        referrer_user: null,
        referrer_npo: "REF-NPO",
        type: "write_off",
        amount: 5,
        npo_amount: 0,
        actor: admin!.id,
      }),
    ]);
  });
});

describe("admin_credit_owed", () => {
  test("adds the admin's credit to the row, recorded with their reason", async () => {
    const admin = await seed_user(t.db, "admin@test.com");
    const owed = await record_owed(as_db(t.db), refund_of(npo_a));
    const credit = (ref: string) =>
      admin_credit_owed(as_db(t.db), {
        owed_id: owed.id,
        usd: 30,
        reason: "cash share of an unfunded payout, debited by hand",
        ref,
        actor: admin!.id,
        now: NOW,
      });

    await credit("payout-1");
    const again = await credit("payout-1");
    const row = await credit("payout-2");

    expect(again).toMatchObject({ credited_back_usd: 30 });
    expect(row).toMatchObject({
      credited_back_usd: 60,
      credited_back_at: NOW,
      outstanding_usd: 33.2,
    });
    expect(
      await t.db
        .select({
          ref: owed_entries.ref,
          reason: owed_entries.reason,
          actor: owed_entries.actor,
        })
        .from(owed_entries)
    ).toEqual(
      expect.arrayContaining([
        {
          ref: "payout-1",
          reason: "cash share of an unfunded payout, debited by hand",
          actor: admin!.id,
        },
        expect.objectContaining({ ref: "payout-2" }),
      ])
    );
  });
});

describe("owed_list", () => {
  /** the npo's $93.20, REF-USER's $5 and REF-NPO's $7, each on its own gift */
  async function seed_three_owing() {
    const referrer = await seed_user(t.db, "ref@test.com", "Rita", "Ref");
    await t.db
      .update(user)
      .set({ referral_code: "REF-USER" })
      .where(eq(user.id, referrer!.id));
    await seed_npo(t.db, {
      registration_number: "EIN-R",
      referral_id: "REF-NPO",
      name: "Referring Org",
    });
    for (const id of ["don-2", "don-3"]) {
      const [base] = await t.db
        .select()
        .from(donations)
        .where(eq(donations.id, DON));
      await t.db.insert(donations).values({ ...base!, id });
    }
    const npo_row = await record_owed(as_db(t.db), refund_of(npo_a));
    await record_owed(as_db(t.db), {
      ...refund_of(npo_a, 5),
      donation_id: "don-2",
      party: { referrer_user: "REF-USER" },
      fee_processing_usd: 0,
      now: "2026-10-05T00:00:00.000Z",
    });
    await record_owed(as_db(t.db), {
      ...refund_of(npo_a, 7),
      donation_id: "don-3",
      party: { referrer_npo: "REF-NPO" },
      source: "dispute",
      source_ref: "dp_1",
      fee_processing_usd: 0,
      now: "2026-10-06T00:00:00.000Z",
    });
    return npo_row;
  }

  test("lists every party's row still owing and hides those at $0", async () => {
    await seed_three_owing();
    const cleared = await record_owed(as_db(t.db), {
      ...refund_of(npo_a),
      party: { referrer_user: "REF-USER" },
    });
    await credit_owed(as_db(t.db), {
      donation_id: cleared.donation_id,
      party: { referrer_user: "REF-USER" },
      reason: "payout_cancelled",
      ref: "payout-1",
      now: NOW,
    });

    const page = await owed_list({ sort: "date", dir: "asc" }, as_db(t.db));

    expect(page.next).toBeUndefined();
    expect(page.items).toEqual([
      expect.objectContaining({
        donation_id: DON,
        party: "npo",
        party_name: expect.any(String),
        npo_id: npo_a,
        source: "refund",
        source_ref: "re_1",
        received_usd: 90,
        fee_processing_usd: 3.2,
        fee_dispute_usd: 0,
        credited_back_usd: 0,
        recovered_usd: 0,
        outstanding_usd: 93.2,
        recorded_at: NOW,
      }),
      expect.objectContaining({
        donation_id: "don-2",
        party: "referrer",
        party_name: "Rita Ref",
        referrer_user: "REF-USER",
        outstanding_usd: 5,
      }),
      expect.objectContaining({
        donation_id: "don-3",
        party: "referrer",
        party_name: "Referring Org",
        referrer_npo: "REF-NPO",
        source: "dispute",
        source_ref: "dp_1",
        outstanding_usd: 7,
      }),
    ]);
  });

  test("filters to one party and sorts by what is outstanding", async () => {
    await seed_three_owing();
    const list = async (o: Parameters<typeof owed_list>[0]) =>
      (await owed_list(o, as_db(t.db))).items.map((r) => r.outstanding_usd);

    expect(await list({ sort: "outstanding", dir: "desc" })).toEqual([
      93.2, 7, 5,
    ]);
    expect(
      await list({ party: "referrer", sort: "outstanding", dir: "asc" })
    ).toEqual([5, 7]);
    expect(await list({ party: "npo", sort: "date", dir: "desc" })).toEqual([
      93.2,
    ]);
    expect(await list({ sort: "date", dir: "desc" })).toEqual([7, 5, 93.2]);
  });

  test("pages through rows of equal outstanding without repeating or skipping one", async () => {
    await seed_three_owing();
    // the referrer npo's row now owes the same $5 as the referrer user's
    await credit_owed(as_db(t.db), {
      donation_id: "don-3",
      party: { referrer_npo: "REF-NPO" },
      usd: 2,
      reason: "payout_cancelled",
      ref: "payout-1",
      now: NOW,
    });

    const seen: number[] = [];
    let next: string | undefined;
    do {
      const page = await owed_list(
        { sort: "outstanding", dir: "asc", limit: 1, next },
        as_db(t.db)
      );
      seen.push(...page.items.map((r) => r.outstanding_usd));
      next = page.next;
    } while (next);

    expect(seen).toEqual([5, 5, 93.2]);
  });
});
