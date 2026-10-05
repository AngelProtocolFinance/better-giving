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
import { seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import { user } from "../schema/auth";
import { donations } from "../schema/donation";
import { npos } from "../schema/npo";
import { owed_amounts } from "../schema/owed";
import { payouts, settlements } from "../schema/payout";
import { loss_logs } from "../schema/revenue";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import type { DbOrTx } from "./helpers";
import {
  admin_credit_owed,
  credit_owed,
  type OwedCreditReason,
  type OwedParty,
  owed_for_donation,
  owed_list,
  record_owed,
  recover_owed,
  repay_owed,
  unrecover_owed,
  write_off_owed,
} from "./owed";
import {
  grant_run_deductions,
  npo_owed_history,
  referrer_owed_history,
} from "./owed-history";

const terms = vi.hoisted(() => ({ effective: null as string | null }));
vi.mock("../../env", async (io) => ({
  ...(await io<typeof import("../../env")>()),
  get owed_terms_effective() {
    return terms.effective;
  },
}));

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which these queries do not read
const as_db = (x: unknown) => x as DbOrTx;

const EFFECTIVE = "2026-11-01T00:00:00.000Z";
const DAY_BEFORE = "2026-10-31T23:59:59.000Z";
const NOW = "2026-11-20T12:00:00.000Z";

let t: TestDb;
let npo_a: number;

beforeAll(async () => {
  t = await create_test_db();
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

beforeEach(async () => {
  terms.effective = EFFECTIVE;
  await t.db.delete(loss_logs);
  await t.db.delete(owed_amounts);
  await t.db.delete(payouts);
  await t.db.delete(settlements);
  await t.db.delete(donations);
  await t.db.delete(npos);
  await t.db.delete(user);
  npo_a = (await seed_npo(t.db, { registration_number: "EIN-A" }))!.id;
});

const gift = (id: string, created_at: string, amount_base = 100) =>
  t.db.insert(donations).values({
    id,
    upusd: 1,
    status: "settled",
    amount_base,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
    created_at,
  });

/** the $100 card gift's refund: $90 net to the party, $3.20 card fee */
const refund = (donation_id: string, party: OwedParty) =>
  record_owed(as_db(t.db), {
    donation_id,
    party,
    source: "refund",
    source_ref: `re_${donation_id}`,
    received_usd: 90,
    fee_processing_usd: 3.2,
    now: NOW,
  });

describe("which rows reach their party", () => {
  test("a gift made on the effective date reaches the npo, one made the day before does not", async () => {
    await gift("don-on", EFFECTIVE);
    await gift("don-before", DAY_BEFORE);
    await refund("don-on", { npo_id: npo_a });
    await refund("don-before", { npo_id: npo_a });

    const rows = await npo_owed_history(npo_a, as_db(t.db));
    expect(rows.map((r) => r.donation_id)).toEqual(["don-on"]);
  });

  test("while the date is unset no row reaches the npo, and the admin list still has it", async () => {
    terms.effective = null;
    await gift("don-on", EFFECTIVE);
    await refund("don-on", { npo_id: npo_a });

    expect(await npo_owed_history(npo_a, as_db(t.db))).toEqual([]);
    const admin = await owed_list({ sort: "date", dir: "desc" }, as_db(t.db));
    expect(admin.items.map((r) => r.donation_id)).toEqual(["don-on"]);
  });
});

describe("npo_owed_history", () => {
  const RUN_AT = "2026-11-21T00:00:00.000Z";
  const CREDIT_AT = "2026-11-22T00:00:00.000Z";
  const WAIVE_AT = "2026-11-23T00:00:00.000Z";

  test("shows a recorded, a partly recovered, a credited-back and a waived row, each with its figures", async () => {
    const admin = await seed_user(t.db, "admin@test.com");
    for (const id of ["don-1", "don-2", "don-3", "don-4"]) {
      await gift(id, "2026-11-05T10:00:00.000Z");
      await refund(id, { npo_id: npo_a });
    }
    // a grant run that sent a transfer: the settlement is the transfer, the
    // run's ref its other id
    await t.db.insert(settlements).values({
      id: "wise-tx-1",
      other_id: "run-1",
      npo_id: npo_a,
      date: RUN_AT,
      amount: 60,
      sources: [],
      status: "",
    });
    await recover_owed(as_db(t.db), {
      donation_id: "don-2",
      party: { npo_id: npo_a },
      usd: 40,
      reason: "grant_run",
      ref: "run-1",
      now: RUN_AT,
    });
    await credit_owed(as_db(t.db), {
      donation_id: "don-3",
      party: { npo_id: npo_a },
      reason: "payout_cancelled",
      ref: "payout-1",
      now: CREDIT_AT,
    });
    const [waived] = await owed_for_donation("don-4", as_db(t.db));
    await write_off_owed(as_db(t.db), {
      owed_id: waived!.id,
      reason: "pre-terms",
      actor: admin!.id,
      now: WAIVE_AT,
    });

    const rows = await npo_owed_history(npo_a, as_db(t.db));
    const base = {
      gift_date: "2026-11-05T10:00:00.000Z",
      gift_amount: 100,
      gift_currency: "USD",
      source: "refund",
      recorded_at: NOW,
      received_usd: 90,
      fee_processing_usd: 3.2,
      fee_dispute_usd: 0,
      recovered_usd: 0,
      credited_back_usd: 0,
      refund_failed_usd: 0,
      dispute_won_usd: 0,
      written_off_usd: 0,
      credited_back_at: null,
      written_off_at: null,
      recoveries: [],
    };
    expect(Object.fromEntries(rows.map((r) => [r.donation_id, r]))).toEqual({
      "don-1": {
        ...base,
        id: expect.any(String),
        donation_id: "don-1",
        state: "recorded",
        outstanding_usd: 93.2,
      },
      "don-2": {
        ...base,
        id: expect.any(String),
        donation_id: "don-2",
        state: "partly_recovered",
        recovered_usd: 40,
        outstanding_usd: 53.2,
        recoveries: [
          {
            run_ref: "run-1",
            reason: "grant_run",
            settlement_id: "wise-tx-1",
            usd: 40,
            at: RUN_AT,
          },
        ],
      },
      "don-3": {
        ...base,
        id: expect.any(String),
        donation_id: "don-3",
        state: "credited_back",
        credited_back_usd: 93.2,
        credited_back_at: CREDIT_AT,
        outstanding_usd: 0,
      },
      "don-4": {
        ...base,
        id: waived!.id,
        donation_id: "don-4",
        state: "waived",
        written_off_usd: 93.2,
        written_off_at: WAIVE_AT,
        outstanding_usd: 0,
      },
    });
  });

  const recover = (usd: number, ref: string) =>
    recover_owed(as_db(t.db), {
      donation_id: "don-1",
      party: { npo_id: npo_a },
      usd,
      reason: "grant_run",
      ref,
      now: RUN_AT,
    });

  test("a row recovered in full reads recovered", async () => {
    await gift("don-1", EFFECTIVE);
    await refund("don-1", { npo_id: npo_a });
    await recover(93.2, "run-1");

    const [row] = await npo_owed_history(npo_a, as_db(t.db));
    expect([row!.state, row!.outstanding_usd]).toEqual(["recovered", 0]);
  });

  test("a run whose transfer went unfunded leaves no line", async () => {
    await gift("don-1", EFFECTIVE);
    await refund("don-1", { npo_id: npo_a });
    await recover(10, "run-1");
    await recover(20, "run-2");
    await unrecover_owed(as_db(t.db), {
      npo_id: npo_a,
      ref: "run-2",
      now: CREDIT_AT,
    });

    const [row] = await npo_owed_history(npo_a, as_db(t.db));
    expect(row!.recoveries.map((l) => [l.run_ref, l.usd])).toEqual([
      ["run-1", 10],
    ]);
    expect(row!.recovered_usd).toBe(10);
  });

  test("a full refund after a failed partial shows the gift's own figures, net of what the failed refund credited", async () => {
    await gift("don-1", EFFECTIVE);
    const record = (source_ref: string, received_usd: number, fee: number) =>
      record_owed(as_db(t.db), {
        donation_id: "don-1",
        party: { npo_id: npo_a },
        source: "refund",
        source_ref,
        received_usd,
        fee_processing_usd: fee,
        now: NOW,
      });
    await record("re_1", 36, 1.28);
    for (const [reason, usd] of [
      ["refund_failed", 36],
      ["refund_failed_fee", 1.28],
    ] as const) {
      await credit_owed(as_db(t.db), {
        donation_id: "don-1",
        party: { npo_id: npo_a },
        usd,
        reason,
        ref: `${reason}:re_1`,
        now: CREDIT_AT,
      });
    }
    await record("re_2", 90, 3.2);

    const [row] = await npo_owed_history(npo_a, as_db(t.db));
    expect(row).toMatchObject({
      state: "recorded",
      received_usd: 90,
      fee_processing_usd: 3.2,
      credited_back_usd: 0,
      outstanding_usd: 93.2,
    });
  });

  test("a refund that failed after it was recorded shows what its failure credited back", async () => {
    await gift("don-1", EFFECTIVE);
    await refund("don-1", { npo_id: npo_a });
    for (const [reason, usd] of [
      ["refund_failed", 90],
      ["refund_failed_fee", 3.2],
    ] as const) {
      await credit_owed(as_db(t.db), {
        donation_id: "don-1",
        party: { npo_id: npo_a },
        usd,
        reason,
        ref: `${reason}:re_don-1`,
        now: CREDIT_AT,
      });
    }

    const [row] = await npo_owed_history(npo_a, as_db(t.db));
    expect(row).toMatchObject({
      state: "credited_back",
      refund_failed_usd: 93.2,
      credited_back_usd: 0,
      outstanding_usd: 0,
    });
  });

  describe("after a dispute won", () => {
    const record = (
      source: "refund" | "dispute",
      source_ref: string,
      received_usd: number,
      fee: number,
      fee_dispute_usd = 0
    ) =>
      record_owed(as_db(t.db), {
        donation_id: "don-1",
        party: { npo_id: npo_a },
        source,
        source_ref,
        received_usd,
        fee_processing_usd: fee,
        fee_dispute_usd,
        now: NOW,
      });
    const win = async (credits: [OwedCreditReason, number][]) => {
      for (const [reason, usd] of credits) {
        await credit_owed(as_db(t.db), {
          donation_id: "don-1",
          party: { npo_id: npo_a },
          usd,
          reason,
          ref: `${reason}:dp_1`,
          now: CREDIT_AT,
        });
      }
    };

    test("a full claim accepted, then the whole refund, reads the gift's own figures", async () => {
      await gift("don-1", EFFECTIVE);
      await record("dispute", "dp_1", 90, 3.2);
      await win([
        ["dispute_won", 90],
        ["dispute_won_fee", 3.2],
      ]);
      await record("refund", "re_1", 90, 3.2);

      const [row] = await npo_owed_history(npo_a, as_db(t.db));
      expect(row).toMatchObject({
        state: "recorded",
        received_usd: 90,
        fee_processing_usd: 3.2,
        fee_dispute_usd: 0,
        credited_back_usd: 0,
        dispute_won_usd: 93.2,
        refund_failed_usd: 0,
        outstanding_usd: 93.2,
      });
    });

    test("a stripe dispute won, then a $40 refund, reads the refund's own figures", async () => {
      await gift("don-1", EFFECTIVE);
      await record("dispute", "dp_1", 90, 3.2, 15);
      await win([
        ["dispute_won", 90],
        ["dispute_won_fee", 3.2],
        ["dispute_won_fee_dispute", 15],
      ]);
      await record("refund", "re_1", 36, 1.28);

      const [row] = await npo_owed_history(npo_a, as_db(t.db));
      expect(row).toMatchObject({
        state: "recorded",
        received_usd: 36,
        fee_processing_usd: 1.28,
        fee_dispute_usd: 0,
        credited_back_usd: 0,
        dispute_won_usd: 108.2,
        refund_failed_usd: 0,
        outstanding_usd: 37.28,
      });
    });
  });

  test("a row still owing reads by what it owes, not by an earlier credit or write-off", async () => {
    const admin = await seed_user(t.db, "admin@test.com");
    await gift("don-1", EFFECTIVE);
    await gift("don-2", EFFECTIVE);
    const credited = await refund("don-1", { npo_id: npo_a });
    const waived = await refund("don-2", { npo_id: npo_a });
    await admin_credit_owed(as_db(t.db), {
      owed_id: credited.id,
      usd: 10,
      reason: "goodwill",
      ref: "c-1",
      actor: admin!.id,
      now: CREDIT_AT,
    });
    await write_off_owed(as_db(t.db), {
      owed_id: waived.id,
      reason: "uncollectable",
      actor: admin!.id,
      now: WAIVE_AT,
    });
    // a lost dispute on the written-off gift owes its fee anew
    await record_owed(as_db(t.db), {
      donation_id: "don-2",
      party: { npo_id: npo_a },
      source: "dispute",
      source_ref: "dp_1",
      received_usd: 90,
      fee_processing_usd: 3.2,
      fee_dispute_usd: 15,
      now: WAIVE_AT,
    });

    const rows = await npo_owed_history(npo_a, as_db(t.db));
    expect(
      Object.fromEntries(
        rows.map((r) => [r.donation_id, [r.state, r.outstanding_usd]])
      )
    ).toEqual({ "don-1": ["recorded", 83.2], "don-2": ["recorded", 15] });
  });
});

describe("grant_run_deductions", () => {
  const RUN_AT = "2026-11-21T00:00:00.000Z";
  const deduct = (
    verb: typeof recover_owed,
    donation_id: string,
    usd: number,
    ref = "run-1"
  ) =>
    verb(as_db(t.db), {
      donation_id,
      party: { npo_id: npo_a },
      usd,
      reason: "grant_run",
      ref,
      now: RUN_AT,
    });

  test("a run's gross is its net plus its deductions by gift, a payout refunded in flight included", async () => {
    for (const id of ["don-1", "don-2", "don-3"]) {
      await gift(id, "2026-11-05T10:00:00.000Z");
      await refund(id, { npo_id: npo_a });
    }
    // don-3 is due $10 back: recovered by an earlier run, then credited
    await deduct(recover_owed, "don-3", 10, "run-0");
    await credit_owed(as_db(t.db), {
      donation_id: "don-3",
      party: { npo_id: npo_a },
      reason: "dispute_won",
      ref: "dp_won",
      now: RUN_AT,
    });
    await deduct(recover_owed, "don-1", 12.5);
    await deduct(recover_owed, "don-2", 7.5);
    await deduct(repay_owed, "don-3", 2.5);
    await t.db.insert(settlements).values({
      id: "wise-tx-1",
      other_id: "run-1",
      npo_id: npo_a,
      date: RUN_AT,
      amount: 62.5,
      sources: [],
      status: "",
    });
    // the run sent $80 for two payouts; one was loss-refunded in flight, so it
    // never settled under the run's settlement
    await t.db.insert(payouts).values([
      {
        id: "p-0",
        source_id: "d-0",
        npo_id: npo_a,
        source: "donation",
        date: RUN_AT,
        amount: 50,
        type: "settled",
        settled_date: RUN_AT,
        settled_id: "wise-tx-1",
      },
      {
        id: "p-1",
        source_id: "d-1",
        npo_id: npo_a,
        source: "donation",
        date: RUN_AT,
        amount: 30,
        type: "refunded_loss",
      },
    ]);

    const run = await grant_run_deductions(npo_a, "wise-tx-1", as_db(t.db));
    expect(run).toEqual({
      gross: 80,
      net: 62.5,
      deductions: [
        expect.objectContaining({ donation_id: "don-1", usd: 12.5 }),
        expect.objectContaining({ donation_id: "don-2", usd: 7.5 }),
        expect.objectContaining({ donation_id: "don-3", usd: -2.5 }),
      ],
    });
    expect(run!.deductions[0]).toEqual({
      owed_id: expect.any(String),
      donation_id: "don-1",
      gift_date: "2026-11-05T10:00:00.000Z",
      gift_amount: 100,
      gift_currency: "USD",
      usd: 12.5,
    });
  });

  test("lists only the gifts that reach the npo, its gross still the whole run's", async () => {
    await gift("don-old", "2026-10-31T23:59:59.000Z");
    await gift("don-new", EFFECTIVE);
    await refund("don-old", { npo_id: npo_a });
    await refund("don-new", { npo_id: npo_a });
    await deduct(recover_owed, "don-old", 12.5);
    await deduct(recover_owed, "don-new", 7.5);
    await t.db.insert(settlements).values({
      id: "wise-tx-1",
      other_id: "run-1",
      npo_id: npo_a,
      date: RUN_AT,
      amount: 50,
      sources: [],
      status: "",
    });

    const run = await grant_run_deductions(npo_a, "wise-tx-1", as_db(t.db));
    expect(run).toEqual({
      gross: 70,
      net: 50,
      deductions: [
        expect.objectContaining({ donation_id: "don-new", usd: 7.5 }),
      ],
    });
  });

  test("another npo's settlement reads as none", async () => {
    const other = (await seed_npo(t.db, { registration_number: "EIN-B" }))!;
    await t.db.insert(settlements).values({
      id: "wise-tx-2",
      other_id: "run-2",
      npo_id: other.id,
      date: RUN_AT,
      amount: 10,
      sources: [],
      status: "",
    });

    expect(await grant_run_deductions(npo_a, "wise-tx-2", as_db(t.db))).toBe(
      null
    );
    expect(
      await grant_run_deductions(other.id, "wise-tx-2", as_db(t.db))
    ).toEqual({ gross: 10, net: 10, deductions: [] });
  });
});

describe("referrer_owed_history", () => {
  test("shows only that referrer's own rows", async () => {
    for (const [code, email] of [
      ["REF-A", "a@test.com"],
      ["REF-B", "b@test.com"],
    ] as const) {
      const u = await seed_user(t.db, email);
      await t.db
        .update(user)
        .set({ referral_code: code })
        .where(eq(user.id, u!.id));
    }
    await t.db
      .update(npos)
      .set({ referral_id: "NPO-A" })
      .where(eq(npos.id, npo_a));
    await gift("don-1", EFFECTIVE);
    await gift("don-2", EFFECTIVE);
    await refund("don-1", { npo_id: npo_a });
    await refund("don-1", { referrer_user: "REF-A" });
    await refund("don-1", { referrer_user: "REF-B" });
    await refund("don-2", { referrer_npo: "NPO-A" });

    const of = async (p: Parameters<typeof referrer_owed_history>[0]) =>
      (await referrer_owed_history(p, as_db(t.db))).map((r) => r.donation_id);
    expect(await of({ referrer_user: "REF-A" })).toEqual(["don-1"]);
    expect(await of({ referrer_npo: "NPO-A" })).toEqual(["don-2"]);
  });
});
