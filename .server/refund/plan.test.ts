import { describe, expect, test } from "vitest";
import {
  calc_refund_plan,
  type RefundCtx,
  type RefundEffect,
  type RefundInputs,
} from "./plan";

const make_inputs = (overrides: Partial<RefundInputs> = {}): RefundInputs => ({
  dist: {
    id: "dist-1",
    donation_id: "don-1",
    to_id: 1,
    to_name: "Test NPO",
    alloc: { liq: 0, lock: 0, cash: 100 },
    net: 100,
    amount: 110,
    fee_base: 5,
    fee_fsa: 3,
    fee_processing: 2,
  },
  payout: null,
  commission: null,
  rev_log_ids: [],
  bal: { liq: 0, lock_units: 0, cash: 0 },
  nav: null,
  sub_id: null,
  ...overrides,
});

const make_ctx = (overrides: Partial<RefundCtx> = {}): RefundCtx => ({
  now: "2026-06-22T00:00:00.000Z",
  form_id: null,
  program_id: null,
  ...overrides,
});

const kinds = (effects: RefundEffect[]) => effects.map((e) => e.kind);

describe("calc_refund_plan", () => {
  test("baseline cash-only payout pending → cancel + commission/form/program absent", () => {
    const plan = calc_refund_plan(
      make_inputs({
        payout: { id: "po-1", type: "pending" },
      }),
      make_ctx()
    );
    expect(plan.is_loss).toBe(false);
    expect(kinds(plan.effects)).toEqual([
      "balance_update",
      "payout_status",
      "donation_message_del",
    ]);
    expect(plan.preview.effects.map((l) => l.label)).toContain("Grant payout");
    expect(plan.preview.warnings).toHaveLength(0);
  });

  test("liq-only sufficient → balance_update + bal_tx_put + donation_message_del", () => {
    const plan = calc_refund_plan(
      make_inputs({
        dist: {
          id: "dist-1",
          donation_id: "don-1",
          to_id: 1,
          to_name: "Test NPO",
          alloc: { liq: 100, lock: 0, cash: 0 },
          net: 50,
          amount: 55,
          fee_base: 0,
          fee_fsa: 0,
          fee_processing: 0,
        },
        bal: { liq: 100, lock_units: 0, cash: 0 },
      }),
      make_ctx()
    );
    expect(plan.is_loss).toBe(false);
    expect(kinds(plan.effects)).toEqual([
      "balance_update",
      "bal_tx_put",
      "donation_message_del",
    ]);
    const bt = plan.effects.find((e) => e.kind === "bal_tx_put");
    expect(bt && bt.kind === "bal_tx_put" && bt.tx.account).toBe("liq");
    expect(bt && bt.kind === "bal_tx_put" && bt.tx.bal_begin).toBe(100);
    expect(bt && bt.kind === "bal_tx_put" && bt.tx.bal_end).toBe(50);
  });

  test("liq-only insufficient → loss with balance_liq type", () => {
    const plan = calc_refund_plan(
      make_inputs({
        dist: {
          id: "dist-1",
          donation_id: "don-1",
          to_id: 1,
          to_name: "Test NPO",
          alloc: { liq: 100, lock: 0, cash: 0 },
          net: 50,
          amount: 55,
          fee_base: 1,
          fee_fsa: 2,
          fee_processing: 3,
        },
        bal: { liq: 10, lock_units: 0, cash: 0 },
      }),
      make_ctx()
    );
    expect(plan.is_loss).toBe(true);
    // no balance writes on loss
    expect(kinds(plan.effects)).toEqual(["donation_message_del", "loss_log"]);
    const loss = plan.effects.find((e) => e.kind === "loss_log");
    expect(loss && loss.kind === "loss_log" && loss.loss.type).toBe(
      "balance_liq"
    );
    expect(loss && loss.kind === "loss_log" && loss.loss.fees_bg).toBe(3);
    expect(loss && loss.kind === "loss_log" && loss.loss.fees_processing).toBe(
      3
    );
    expect(plan.preview.warnings.map((l) => l.label)).toContain(
      "Savings balance"
    );
  });

  test("lock-only sufficient at nav → bal_tx_put(lock) + nav_log", () => {
    const plan = calc_refund_plan(
      make_inputs({
        dist: {
          id: "dist-1",
          donation_id: "don-1",
          to_id: 1,
          to_name: "Test NPO",
          alloc: { liq: 0, lock: 100, cash: 0 },
          net: 80,
          amount: 88,
          fee_base: 0,
          fee_fsa: 0,
          fee_processing: 0,
        },
        bal: { liq: 0, lock_units: 100, cash: 0 },
        nav: { price: 2 },
      }),
      make_ctx()
    );
    expect(plan.is_loss).toBe(false);
    expect(kinds(plan.effects)).toEqual([
      "balance_update",
      "bal_tx_put",
      "nav_log",
      "donation_message_del",
    ]);
    const bt = plan.effects.find((e) => e.kind === "bal_tx_put");
    expect(bt && bt.kind === "bal_tx_put" && bt.tx.amount_units).toBe(40); // 80 / 2
    const navlog = plan.effects.find((e) => e.kind === "nav_log");
    expect(navlog && navlog.kind === "nav_log" && navlog.entry.cash_delta).toBe(
      -80
    );
    expect(
      navlog &&
        navlog.kind === "nav_log" &&
        navlog.entry.holder_deltas[0].units_delta
    ).toBe(-40);
  });

  test("lock-only insufficient units → loss balance_lock; payout untouched", () => {
    const plan = calc_refund_plan(
      make_inputs({
        dist: {
          id: "dist-1",
          donation_id: "don-1",
          to_id: 1,
          to_name: "Test NPO",
          alloc: { liq: 0, lock: 100, cash: 0 },
          net: 80,
          amount: 88,
          fee_base: 0,
          fee_fsa: 0,
          fee_processing: 0,
        },
        bal: { liq: 0, lock_units: 1, cash: 0 },
        nav: { price: 2 },
      }),
      make_ctx()
    );
    expect(plan.is_loss).toBe(true);
    const loss = plan.effects.find((e) => e.kind === "loss_log");
    expect(loss && loss.kind === "loss_log" && loss.loss.type).toBe(
      "balance_lock"
    );
    expect(kinds(plan.effects)).not.toContain("nav_log");
    expect(kinds(plan.effects)).not.toContain("balance_update");
  });

  test("cash payout already paid → loss with payout type", () => {
    const plan = calc_refund_plan(
      make_inputs({
        payout: { id: "po-1", type: "settled" },
      }),
      make_ctx()
    );
    expect(plan.is_loss).toBe(true);
    const loss = plan.effects.find((e) => e.kind === "loss_log");
    expect(loss && loss.kind === "loss_log" && loss.loss.type).toBe("payout");
    // loss path marks payout as refunded_loss
    const pos = plan.effects.filter((e) => e.kind === "payout_status");
    expect(pos).toHaveLength(1);
    expect(pos[0].kind === "payout_status" && pos[0].status).toBe(
      "refunded_loss"
    );
  });

  test("mixed alloc: all sufficient → canonical effect order", () => {
    const plan = calc_refund_plan(
      make_inputs({
        dist: {
          id: "dist-1",
          donation_id: "don-1",
          to_id: 1,
          to_name: "Test NPO",
          alloc: { liq: 50, lock: 30, cash: 20 },
          net: 100,
          amount: 110,
          fee_base: 0,
          fee_fsa: 0,
          fee_processing: 0,
        },
        payout: { id: "po-1", type: "pending" },
        bal: { liq: 100, lock_units: 100, cash: 0 },
        nav: { price: 1 },
        commission: { donation_id: "don-1", amount: 5 },
        rev_log_ids: ["rl-1", "rl-2"],
      }),
      make_ctx({ form_id: "form-1", program_id: "prog-1" })
    );
    expect(plan.is_loss).toBe(false);
    expect(kinds(plan.effects)).toEqual([
      "balance_update",
      "bal_tx_put", // liq
      "bal_tx_put", // lock
      "payout_status", // refunded
      "nav_log",
      "rev_log_status",
      "rev_log_status",
      "commission_status",
      "form_decrement",
      "program_decrement",
      "donation_message_del",
    ]);
  });

  test("commission status follows is_loss", () => {
    const plan_ok = calc_refund_plan(
      make_inputs({
        payout: { id: "po-1", type: "pending" },
        commission: { donation_id: "don-1", amount: 5 },
      }),
      make_ctx()
    );
    const c_ok = plan_ok.effects.find((e) => e.kind === "commission_status");
    expect(c_ok && c_ok.kind === "commission_status" && c_ok.status).toBe(
      "refunded"
    );

    const plan_loss = calc_refund_plan(
      make_inputs({
        payout: { id: "po-1", type: "settled" },
        commission: { donation_id: "don-1", amount: 5 },
      }),
      make_ctx()
    );
    const c_loss = plan_loss.effects.find(
      (e) => e.kind === "commission_status"
    );
    expect(c_loss && c_loss.kind === "commission_status" && c_loss.status).toBe(
      "refunded_loss"
    );
  });

  test("sub_id adds Subscription preview line", () => {
    const plan = calc_refund_plan(
      make_inputs({
        payout: { id: "po-1", type: "pending" },
        sub_id: "sub_123",
      }),
      make_ctx()
    );
    expect(plan.preview.effects.map((l) => l.label)).toContain("Subscription");
  });

  test("zero-alloc dist → 'No balance changes' preview, only donation_message_del", () => {
    const plan = calc_refund_plan(
      make_inputs({
        dist: {
          id: "dist-1",
          donation_id: "don-1",
          to_id: 1,
          to_name: "Test NPO",
          alloc: { liq: 0, lock: 0, cash: 0 },
          net: 0,
          amount: 0,
          fee_base: 0,
          fee_fsa: 0,
          fee_processing: 0,
        },
      }),
      make_ctx()
    );
    expect(plan.is_loss).toBe(false);
    expect(plan.preview.effects).toEqual([
      { label: "No balance changes", pass: true },
    ]);
    expect(kinds(plan.effects)).toEqual([
      "balance_update",
      "donation_message_del",
    ]);
  });

  test("loss_log uses ctx.now as date", () => {
    const plan = calc_refund_plan(
      make_inputs({
        payout: { id: "po-1", type: "settled" },
      }),
      make_ctx({ now: "2026-12-25T12:00:00.000Z" })
    );
    const loss = plan.effects.find((e) => e.kind === "loss_log");
    expect(loss && loss.kind === "loss_log" && loss.loss.date).toBe(
      "2026-12-25T12:00:00.000Z"
    );
  });

  test("plan.amount equals dist.amount for total_loss aggregation", () => {
    const plan = calc_refund_plan(
      make_inputs({
        dist: {
          id: "dist-1",
          donation_id: "don-1",
          to_id: 1,
          to_name: "Test NPO",
          alloc: { liq: 100, lock: 0, cash: 0 },
          net: 50,
          amount: 55,
          fee_base: 0,
          fee_fsa: 0,
          fee_processing: 0,
        },
        bal: { liq: 0, lock_units: 0, cash: 0 },
      }),
      make_ctx()
    );
    expect(plan.is_loss).toBe(true);
    expect(plan.amount).toBe(55);
  });
});
