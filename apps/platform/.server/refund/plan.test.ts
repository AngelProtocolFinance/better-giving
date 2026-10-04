import { describe, expect, test } from "vitest";
import {
  calc_refund_plan,
  dist_settled_usd,
  type RefundCtx,
  type RefundEffect,
  type RefundInputs,
  type RefundPlan,
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
    amount_usd: 110,
    fee_base: 5,
    fee_fsa: 3,
    fee_processing: 2,
    fee_allowance: 0,
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
  // deliberately not `now` — the nav log's stamp is minted separately so two
  // distributions of one fund refund can't collide on the nav_logs primary key
  nav_date: "2026-06-22T00:00:00.001Z",
  form_id: null,
  program_id: null,
  ...overrides,
});

const kinds = (effects: RefundEffect[]) => effects.map((e) => e.kind);

const owed_of = (plan: RefundPlan) =>
  plan.effects.flatMap((e) => (e.kind === "owed" ? [e.owed] : []))[0];

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
      "payout_status",
      "balance_update",
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
          amount_usd: 55,
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

  test("liq-only insufficient → the npo owes its whole share plus the card fee", () => {
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
          amount_usd: 55,
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
    expect(kinds(plan.effects)).toEqual(["donation_message_del", "owed"]);
    expect(owed_of(plan)).toMatchObject({
      received_usd: 50,
      fee_processing_usd: 3,
    });
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
          amount_usd: 88,
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

  test("lock-only insufficient units → the npo owes its share; payout untouched", () => {
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
          amount_usd: 88,
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
    expect(owed_of(plan)).toMatchObject({
      received_usd: 80,
      fee_processing_usd: 0,
    });
    expect(kinds(plan.effects)).not.toContain("nav_log");
    expect(kinds(plan.effects)).not.toContain("balance_update");
  });

  // the ticket's $100 card gift: $90 net, a $3.20 card fee and $6.80 of bg fees
  test("a paid grant → the npo owes what it received plus the card fee, not bg's fees", () => {
    const plan = calc_refund_plan(
      make_inputs({
        dist: {
          ...make_inputs().dist,
          net: 90,
          amount: 100,
          amount_usd: 100,
          fee_base: 4.3,
          fee_fsa: 2.5,
          fee_processing: 3.2,
        },
        payout: { id: "po-1", type: "settled" },
      }),
      make_ctx()
    );
    expect(owed_of(plan)).toEqual({
      donation_id: "don-1",
      party: { npo_id: 1 },
      received_usd: 90,
      fee_processing_usd: 3.2,
      now: "2026-06-22T00:00:00.000Z",
    });
    expect(plan.amount).toBe(93.2);
  });

  test("cash payout already paid → the npo owes it", () => {
    const plan = calc_refund_plan(
      make_inputs({
        payout: { id: "po-1", type: "settled" },
      }),
      make_ctx()
    );
    expect(plan.is_loss).toBe(true);
    // loss path marks payout as refunded_loss, first like the cancel path
    expect(kinds(plan.effects)).toEqual([
      "payout_status",
      "donation_message_del",
      "owed",
    ]);
    const [po] = plan.effects;
    expect(po.kind === "payout_status" && po.status).toBe("refunded_loss");
  });

  test("savings short, cash payout pending → payout cancelled, only the shortfall is owed", () => {
    const plan = calc_refund_plan(
      make_inputs({
        dist: {
          id: "dist-1",
          donation_id: "don-1",
          to_id: 1,
          to_name: "Test NPO",
          alloc: { liq: 60, lock: 0, cash: 40 },
          net: 100,
          amount: 110,
          amount_usd: 110,
          fee_base: 5,
          fee_fsa: 3,
          fee_processing: 2,
        },
        payout: { id: "po-1", type: "pending" },
        bal: { liq: 10, lock_units: 0, cash: 40 },
      }),
      make_ctx()
    );
    expect(plan.is_loss).toBe(true);
    expect(plan.effects.slice(0, 2)).toEqual([
      { kind: "payout_status", payout_id: "po-1", status: "refunded" },
      {
        kind: "balance_update",
        npo_id: 1,
        deltas: { liq: 0, lock: 0, lock_units: 0, cash: 40 },
      },
    ]);
    expect(owed_of(plan)).toMatchObject({
      received_usd: 60,
      fee_processing_usd: 2,
    });
    expect(plan.amount).toBe(62);
  });

  // dists.amount_usd is the pledge at the donation-time rate; net is settled usd
  test("a gift that gained value before settling → the settled shortfall is owed", () => {
    const plan = calc_refund_plan(
      make_inputs({
        dist: {
          ...make_inputs().dist,
          alloc: { liq: 60, lock: 0, cash: 40 },
          amount_usd: 90,
        },
        payout: { id: "po-1", type: "pending" },
        bal: { liq: 50, lock_units: 0, cash: 40 },
      }),
      make_ctx()
    );
    expect(plan.is_loss).toBe(true);
    expect(owed_of(plan)).toMatchObject({ received_usd: 60 });
    expect(plan.amount).toBe(62);
  });

  test("cash payout mid-transfer (processing) → owed, like a paid one", () => {
    const plan = calc_refund_plan(
      make_inputs({
        payout: { id: "po-1", type: "processing" },
      }),
      make_ctx()
    );
    expect(plan.is_loss).toBe(true);
    expect(owed_of(plan)).toMatchObject({ received_usd: 100 });
    expect(plan.effects.some((e) => e.kind === "balance_update")).toBe(false);
    const [po] = plan.effects;
    expect(po.kind === "payout_status" && po.status).toBe("refunded_loss");
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
          amount_usd: 110,
          fee_base: 0,
          fee_fsa: 0,
          fee_processing: 0,
        },
        payout: { id: "po-1", type: "pending" },
        bal: { liq: 100, lock_units: 100, cash: 0 },
        nav: { price: 1 },
        commission: { donation_id: "don-1", amount: 5, status: "pending" },
        rev_log_ids: ["rl-1", "rl-2"],
      }),
      make_ctx({ form_id: "form-1", program_id: "prog-1" })
    );
    expect(plan.is_loss).toBe(false);
    expect(kinds(plan.effects)).toEqual([
      "payout_status", // refunded
      "balance_update",
      "bal_tx_put", // liq
      "bal_tx_put", // lock
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
        commission: { donation_id: "don-1", amount: 5, status: "pending" },
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
        commission: { donation_id: "don-1", amount: 5, status: "pending" },
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

  // apply decides the loss under the row lock; the preview only says it's likely
  test("a commission claimed for a payout previews as a loss", () => {
    const plan = calc_refund_plan(
      make_inputs({
        payout: { id: "po-1", type: "pending" },
        commission: { donation_id: "don-1", amount: 5, status: "processing" },
      }),
      make_ctx()
    );
    expect(plan.preview.warnings).toContainEqual({
      label: "Commission",
      pass: false,
      reason:
        "$5.00 is in a payout to its referrer, so it will be reversed as a loss",
    });
    expect(plan.preview.effects.map((l) => l.label)).not.toContain(
      "Commission"
    );
    expect(plan.is_loss).toBe(false);
  });

  // the referrer has the money: the refund can't take it back
  test("a paid commission is left paid", () => {
    const plan = calc_refund_plan(
      make_inputs({
        payout: { id: "po-1", type: "pending" },
        commission: { donation_id: "don-1", amount: 5, status: "paid" },
      }),
      make_ctx()
    );
    expect(kinds(plan.effects)).not.toContain("commission_status");
    expect(plan.is_loss).toBe(false);
  });

  // the referrer's, not the npo's: nothing owed by the npo
  test("a paid commission is carried for the alert, not owed by the npo", () => {
    const plan = calc_refund_plan(
      make_inputs({
        payout: { id: "po-1", type: "pending" },
        commission: { donation_id: "don-1", amount: 5, status: "paid" },
      }),
      make_ctx()
    );
    expect(plan.paid_commission).toEqual({ donation_id: "don-1", amount: 5 });
    expect(kinds(plan.effects)).not.toContain("owed");
    expect(kinds(plan.effects)).toContain("balance_update");
    expect(plan.loss_reasons).toEqual([]);
  });

  test("a paid commission previews as already paid and the platform's loss", () => {
    const plan = calc_refund_plan(
      make_inputs({
        payout: { id: "po-1", type: "pending" },
        commission: { donation_id: "don-1", amount: 5, status: "paid" },
      }),
      make_ctx()
    );
    expect(plan.preview.warnings).toContainEqual({
      label: "Commission",
      pass: false,
      reason:
        "$5.00 was already paid to its referrer, so it stays with them as the platform's loss (ops is alerted)",
    });
    expect(plan.preview.effects.map((l) => l.label)).not.toContain(
      "Commission"
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
          amount_usd: 0,
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

  test("dist alloc missing a share → that share is 0, deltas stay finite", () => {
    const plan = calc_refund_plan(
      make_inputs({
        dist: {
          id: "dist-1",
          donation_id: "don-1",
          to_id: 1,
          to_name: "Test NPO",
          // jsonb alloc written without a cash key
          alloc: { liq: 100, lock: 0 },
          net: 50,
          amount: 55,
          amount_usd: 55,
          fee_base: 0,
          fee_fsa: 0,
          fee_processing: 0,
        },
        bal: { liq: 100, lock_units: 0, cash: 0 },
      }),
      make_ctx()
    );
    expect(plan.is_loss).toBe(false);
    const bu = plan.effects.find((e) => e.kind === "balance_update");
    expect(bu && bu.kind === "balance_update" && bu.deltas).toEqual({
      liq: 50,
      lock: 0,
      lock_units: 0,
      cash: 0,
    });
  });

  test("dist alloc with no shares → nothing was credited, nothing reversed", () => {
    const plan = calc_refund_plan(
      make_inputs({
        dist: {
          ...make_inputs().dist,
          alloc: {},
        },
      }),
      make_ctx()
    );
    const bu = plan.effects.find((e) => e.kind === "balance_update");
    expect(bu && bu.kind === "balance_update" && bu.deltas).toEqual({
      liq: 0,
      lock: 0,
      lock_units: 0,
      cash: 0,
    });
  });

  test("the owed figure is recorded at ctx.now", () => {
    const plan = calc_refund_plan(
      make_inputs({
        payout: { id: "po-1", type: "settled" },
      }),
      make_ctx({ now: "2026-12-25T12:00:00.000Z" })
    );
    expect(owed_of(plan)?.now).toBe("2026-12-25T12:00:00.000Z");
  });

  test("the owed figure is settled usd, not its currency amount or pledge rate", () => {
    const plan = calc_refund_plan(
      make_inputs({
        dist: {
          id: "dist-1",
          donation_id: "don-1",
          to_id: 1,
          to_name: "Test NPO",
          alloc: { liq: 100, lock: 0, cash: 0 },
          net: 320,
          amount: 50_000,
          amount_usd: 333.33,
          fee_base: 0,
          fee_fsa: 0,
          fee_processing: 0,
        },
        bal: { liq: 0, lock_units: 0, cash: 0 },
      }),
      make_ctx()
    );
    expect(plan.is_loss).toBe(true);
    expect(owed_of(plan)?.received_usd).toBe(320);
    expect(plan.amount).toBe(320);
  });

  // credit_fa adds the processing fee into net when the donor covered it
  test("a row whose donor covered fees owes the processing fee once, inside net", () => {
    const dist = {
      ...make_inputs().dist,
      alloc: { liq: 100, lock: 0, cash: 0 },
      net: 102,
      amount_usd: null,
      fee_allowance: 2,
    };
    expect(dist_settled_usd(dist)).toBe(110);
    const plan = calc_refund_plan(make_inputs({ dist }), make_ctx());
    expect(owed_of(plan)).toMatchObject({
      received_usd: 102,
      fee_processing_usd: 0,
    });
    expect(plan.amount).toBe(102);
  });
});
