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
import { create_test_db, type TestDb } from "../pg/test-utils/pglite";
import { apply_refund_plan } from "./apply";
import type { RefundPlan } from "./plan";

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
  await db.delete(payouts);
  await db.delete(settlements);
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
    effects: [{ kind: "payout_status", payout_id: PAYOUT_ID, status }],
    preview: { effects: [], blockers: [], warnings: [] },
  };
}

// balance first, as calc_refund_plan emits them
function plan_cancelling_cash(npo_id: number): RefundPlan {
  return {
    is_loss: false,
    loss_reasons: [],
    amount: 100,
    effects: [
      {
        kind: "balance_update",
        npo_id,
        deltas: { liq: 0, lock: 0, lock_units: 0, cash: 100 },
      },
      { kind: "payout_status", payout_id: PAYOUT_ID, status: "refunded" },
    ],
    preview: { effects: [], blockers: [], warnings: [] },
  };
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
    ).rejects.toThrow(/no longer pending/);
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
    ).rejects.toThrow(/no longer pending/);
    expect(await npo_cash(npo_id)).toBe(100);
  });

  test("a pending payout's cash comes off the npo balance", async () => {
    const npo_id = await seed_payout("pending");

    await apply_refund_plan(as_db(test_db.db), plan_cancelling_cash(npo_id));

    expect(await npo_cash(npo_id)).toBe(0);
    expect(await payout_type()).toBe("refunded");
  });
});
