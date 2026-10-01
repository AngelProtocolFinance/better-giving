import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import type { DbOrTx } from "../pg/queries/helpers";
import { npos } from "../pg/schema/npo";
import { payouts, settlements } from "../pg/schema/payout";
import { referrer_commissions } from "../pg/schema/referrer";
import { loss_logs } from "../pg/schema/revenue";
import { create_test_db, type TestDb } from "../pg/test-utils/pglite";
import { apply_refund_plan, StalePayoutError } from "./apply";
import { calc_refund_plan, type RefundPlan } from "./plan";

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which these queries do not read.
const as_db = (x: unknown) => x as DbOrTx;

const PAYOUT_ID = "payout-1";

let test_db: TestDb;

beforeAll(async () => {
  test_db = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

beforeEach(async () => {
  const db = test_db.db;
  await db.delete(loss_logs);
  await db.delete(payouts);
  await db.delete(settlements);
  await db.delete(referrer_commissions);
  await db.delete(npos);
});

async function seed_payout(type: "pending" | "settled") {
  const db = test_db.db;
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-APPLY",
      name: "Apply Test NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      cash: 100,
    })
    .returning();
  if (type === "settled") {
    await db.insert(settlements).values({
      id: "sttl-1",
      npo_id: npo!.id,
      date: "2026-09-02T00:00:00.000Z",
      amount: 100,
      status: "",
    });
  }
  await db.insert(payouts).values({
    id: PAYOUT_ID,
    source_id: "dist-1",
    npo_id: npo!.id,
    source: "donation",
    date: "2026-09-01T00:00:00.000Z",
    amount: 100,
    type,
    ...(type === "settled" && {
      settled_date: "2026-09-02T00:00:00.000Z",
      settled_id: "sttl-1",
    }),
  });
  return npo!.id;
}

function plan_marking(status: "refunded" | "refunded_loss"): RefundPlan {
  return {
    is_loss: status === "refunded_loss",
    loss_reasons: [],
    amount: 100,
    paid_commission: null,
    effects: [{ kind: "payout_status", payout_id: PAYOUT_ID, status }],
    preview: { effects: [], blockers: [], warnings: [] },
  };
}

// drawn by the planner, so the order under test is the one a refund runs
function plan_cancelling_cash(npo_id: number): RefundPlan {
  return calc_refund_plan(
    {
      dist: {
        id: "dist-1",
        donation_id: "don-1",
        to_id: npo_id,
        to_name: "Apply Test NPO",
        alloc: { liq: 0, lock: 0, cash: 100 },
        net: 100,
        amount: 100,
        fee_base: 0,
        fee_fsa: 0,
        fee_processing: 0,
      },
      payout: { id: PAYOUT_ID, type: "pending" },
      commission: null,
      rev_log_ids: [],
      bal: { liq: 0, lock_units: 0, cash: 100 },
      nav: null,
      sub_id: null,
    },
    {
      now: "2026-09-03T00:00:00.000Z",
      nav_date: "2026-09-03T00:00:00.001Z",
      form_id: null,
      program_id: null,
    }
  );
}

async function npo_cash(npo_id: number) {
  const [row] = await test_db.db
    .select({ cash: npos.cash })
    .from(npos)
    .where(eq(npos.id, npo_id));
  return row?.cash;
}

async function payout_type() {
  const [row] = await test_db.db
    .select({ type: payouts.type })
    .from(payouts)
    .where(eq(payouts.id, PAYOUT_ID));
  return row?.type;
}

describe("apply_refund_plan payout_status", () => {
  test("throws when the payout it planned to cancel was settled meanwhile", async () => {
    await seed_payout("settled");

    await expect(
      apply_refund_plan(as_db(test_db.db), plan_marking("refunded"))
    ).rejects.toThrow(StalePayoutError);
    expect(await payout_type()).toBe("settled");
  });

  test("a pending payout is marked refunded", async () => {
    await seed_payout("pending");

    await apply_refund_plan(as_db(test_db.db), plan_marking("refunded"));

    expect(await payout_type()).toBe("refunded");
  });

  // the loss plan is what a re-run produces once the cron has settled the payout
  test("a loss refund marks an already-settled payout refunded_loss", async () => {
    await seed_payout("settled");

    await apply_refund_plan(as_db(test_db.db), plan_marking("refunded_loss"));

    expect(await payout_type()).toBe("refunded_loss");
  });
});

// the grants cron holds the payout rows and then updates the npos row; a refund
// taking them in the other order deadlocks it after wise has paid
describe("apply_refund_plan lock order", () => {
  test("a stale payout throws before the npo balance is written", async () => {
    const npo_id = await seed_payout("settled");

    await expect(
      apply_refund_plan(as_db(test_db.db), plan_cancelling_cash(npo_id))
    ).rejects.toThrow(StalePayoutError);
    expect(await npo_cash(npo_id)).toBe(100);
  });

  test("a pending payout's cash comes off the npo balance", async () => {
    const npo_id = await seed_payout("pending");

    await apply_refund_plan(as_db(test_db.db), plan_cancelling_cash(npo_id));

    expect(await npo_cash(npo_id)).toBe(0);
    expect(await payout_type()).toBe("refunded");
  });
});

describe("apply_refund_plan commission_status", () => {
  async function seed_commission(status: "pending" | "processing" | "paid") {
    const [npo] = await test_db.db
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
    await test_db.db.insert(referrer_commissions).values({
      referrer_npo: "NPO-REF",
      date: "2026-09-01T00:00:00.000Z",
      donation_id: "dist-1",
      npo_id: npo!.id,
      amount: 5,
      status,
      ref: status === "pending" ? null : "ref-1",
    });
  }

  const plan_reversing_commission = (): RefundPlan => ({
    is_loss: false,
    loss_reasons: [],
    amount: 100,
    paid_commission: null,
    effects: [
      { kind: "commission_status", donation_id: "dist-1", status: "refunded" },
    ],
    preview: { effects: [], blockers: [], warnings: [] },
  });

  async function commission_status() {
    const [row] = await test_db.db
      .select({ status: referrer_commissions.status })
      .from(referrer_commissions)
      .where(eq(referrer_commissions.donation_id, "dist-1"));
    return row?.status;
  }

  test("a pending commission is marked refunded", async () => {
    await seed_commission("pending");

    const res = await apply_refund_plan(
      as_db(test_db.db),
      plan_reversing_commission()
    );

    expect(await commission_status()).toBe("refunded");
    expect(res.commission_in_flight).toBeUndefined();
  });

  // its wise transfer may already be paying the referrer
  test("a processing commission is marked refunded_loss and reported", async () => {
    await seed_commission("processing");

    const res = await apply_refund_plan(
      as_db(test_db.db),
      plan_reversing_commission()
    );

    expect(await commission_status()).toBe("refunded_loss");
    expect(res.commission_in_flight).toEqual({
      donation_id: "dist-1",
      amount: 5,
      ref: "ref-1",
    });
  });

  // paid after the plan was drawn: the referrer has the money, so it stays paid
  test("a paid commission is left paid and reported", async () => {
    await seed_commission("paid");

    const res = await apply_refund_plan(
      as_db(test_db.db),
      plan_reversing_commission()
    );

    expect(await commission_status()).toBe("paid");
    expect(res.paid_commission).toEqual({ donation_id: "dist-1", amount: 5 });
  });
});

describe("apply_refund_plan losses", () => {
  // the referrer's paid commission is the platform's loss, never the npo's row
  test("logs only the npo's loss and reports the paid commission", async () => {
    const npo_id = await seed_payout("settled");
    const plan = calc_refund_plan(
      {
        dist: {
          id: "dist-1",
          donation_id: "don-1",
          to_id: npo_id,
          to_name: "Apply Test NPO",
          alloc: { liq: 0, lock: 0, cash: 100 },
          net: 100,
          amount: 100,
          fee_base: 0,
          fee_fsa: 0,
          fee_processing: 0,
        },
        payout: { id: PAYOUT_ID, type: "settled" },
        commission: { donation_id: "dist-1", amount: 5, status: "paid" },
        rev_log_ids: [],
        bal: { liq: 0, lock_units: 0, cash: 100 },
        nav: null,
        sub_id: null,
      },
      {
        now: "2026-09-03T00:00:00.000Z",
        nav_date: "2026-09-03T00:00:00.001Z",
        form_id: null,
        program_id: null,
      }
    );

    const res = await apply_refund_plan(as_db(test_db.db), plan);

    const rows = await test_db.db.select().from(loss_logs);
    expect(rows.map((r) => r.amount)).toEqual([100]);
    expect(res.loss?.amount).toBe(100);
    expect(res.paid_commission).toEqual({ donation_id: "dist-1", amount: 5 });
  });
});
