import { describe, expect, test } from "vitest";
import type { IInput, IParts } from "../types/donation-dist";
import {
  calc_settlement_plan,
  type NpoSettlementContext,
  shared_parts,
} from "./plan";

const amt = (base: number, tip = 0, fee_allowance = 0) => ({
  base,
  tip,
  fee_allowance,
});

const parts = (overrides: Partial<IParts> = {}): IParts => ({
  amnt: amt(100),
  amnt_usd: amt(100),
  fa: amt(0),
  sttl: amt(100),
  sttl_fee: amt(0),
  sttl_fa: amt(0),
  ...overrides,
});

const make_input = (overrides: Partial<IInput> = {}): IInput => ({
  id: 1,
  ps: parts(),
  sttl: { id: "sttl-1", date: "2026-01-01T00:00:00.000Z", currency: "USD" },
  prnt: {
    id: "parent-1",
    to_id: "1",
    to_name: "n",
    to_members: [],
    type: "npo",
  },
  source: undefined,
  program: undefined,
  nav_price: 1,
  tx: {
    currency: "USD",
    upusd: 1,
    frequency: "one-time",
    status: "settled",
    source: "bg-marketplace",
    via: "stripe:card",
    from_email: "d@e.com",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  ...overrides,
});

const make_ctx = (
  overrides: Partial<NpoSettlementContext> = {}
): NpoSettlementContext => ({
  id: 1,
  name: "Test NPO",
  claimed: true,
  fiscal_sponsored: false,
  hide_bg_tip: false,
  allocation: { cash: 100, liq: 0, lock: 0 },
  lock_units: 0,
  liq: 0,
  referrer_user: null,
  referrer_npo: null,
  referrer_expiry: null,
  ...overrides,
});

describe("calc_settlement_plan", () => {
  test("baseline: no tip, no fees, all-cash alloc → payout = gross", () => {
    const plan = calc_settlement_plan(make_input(), make_ctx());
    expect(plan.dist.gross).toBe(100);
    expect(plan.dist.net).toBe(100);
    expect(plan.dist.fees).toEqual({ base: 0, fsa: 0, processing: 0 });
    expect(plan.payout?.amount).toBe(100);
    expect(plan.balance_txs).toHaveLength(0);
    expect(plan.revenue_logs).toHaveLength(0);
    expect(plan.commission).toBeNull();
  });

  test("hide_bg_tip → base fee charged; fiscal_sponsored → fsa fee charged", () => {
    const plan = calc_settlement_plan(
      make_input(),
      make_ctx({ hide_bg_tip: true, fiscal_sponsored: true })
    );
    // base 1.5%, fsa 2.9%
    expect(plan.dist.fees.base).toBeCloseTo(1.5);
    expect(plan.dist.fees.fsa).toBeCloseTo(2.9);
    expect(plan.dist.net).toBeCloseTo(100 - 1.5 - 2.9);
    expect(plan.revenue_logs.map((r) => r.type)).toEqual([
      "base-fee",
      "fsa-fee",
    ]);
  });

  test("invariant: gross == net + base + fsa - fa_excess_credit", () => {
    const plan = calc_settlement_plan(
      make_input(),
      make_ctx({ hide_bg_tip: true, fiscal_sponsored: true })
    );
    expect(plan.dist.gross).toBeCloseTo(
      plan.dist.net + plan.dist.fees.base + plan.dist.fees.fsa
    );
  });

  test("tip > 0 → tip revenue log + tip_received msg with shared id", () => {
    const plan = calc_settlement_plan(
      make_input({ ps: parts({ sttl: amt(100, 5) }) }),
      make_ctx()
    );
    const tip_log = plan.revenue_logs.find((r) => r.type === "tip");
    expect(tip_log?.gross).toBe(5);
    const tip_msg = plan.msgs.find((m) => m.id === "tip-received");
    expect((tip_msg!.payload as { id: string }).id).toBe(tip_log!.id);
  });

  test("active referrer → commission = 30% of (tip + base + fsa)", () => {
    const plan = calc_settlement_plan(
      make_input({ ps: parts({ sttl: amt(100, 10) }) }),
      make_ctx({
        hide_bg_tip: true,
        fiscal_sponsored: true,
        referrer_user: "u-1",
        referrer_expiry: "2099-01-01T00:00:00.000Z",
      })
    );
    const tip_gross = plan.revenue_logs.find((r) => r.type === "tip")!.gross;
    const expected_commission =
      (tip_gross + plan.dist.fees.base + plan.dist.fees.fsa) * 0.3;
    expect(plan.commission?.amount).toBeCloseTo(expected_commission);
    expect(plan.commission?.referrer_user).toBe("u-1");
    expect(plan.dist.referrer?.id).toBe("u-1");
    expect(plan.dist.referrer?.cf_from_tip).toBeCloseTo(tip_gross * 0.3);
  });

  test("expired referrer → no commission, no dist.referrer", () => {
    const plan = calc_settlement_plan(
      make_input(),
      make_ctx({
        hide_bg_tip: true,
        referrer_user: "u-1",
        referrer_expiry: "2020-01-01T00:00:00.000Z",
      })
    );
    expect(plan.commission).toBeNull();
    expect(plan.dist.referrer).toBeUndefined();
  });

  test("alloc 50/30/20 (lock/liq/cash) → 2 balance txs + payout + nav_log_entry", () => {
    const plan = calc_settlement_plan(
      make_input({ nav_price: 2 }),
      make_ctx({ allocation: { lock: 50, liq: 30, cash: 20 } })
    );
    expect(plan.balance_txs).toHaveLength(2);
    expect(plan.balance_txs[0].account).toBe("lock");
    expect(plan.balance_txs[0].amount).toBe(50);
    expect(plan.balance_txs[0].amount_units).toBe(25); // 50 / nav_price 2
    expect(plan.balance_txs[1].account).toBe("liq");
    expect(plan.balance_txs[1].amount).toBe(30);
    expect(plan.payout?.amount).toBe(20);
    expect(plan.nav_log_entry?.cash_delta).toBe(50);
    expect(plan.nav_log_entry?.holder_deltas[0].units_delta).toBe(25);
  });

  test("invariant: balance_deltas sums to net", () => {
    const plan = calc_settlement_plan(
      make_input(),
      make_ctx({ allocation: { lock: 50, liq: 30, cash: 20 } })
    );
    const { liq, lock, cash } = plan.balance_deltas;
    expect(liq + lock + cash).toBeCloseTo(plan.dist.net);
  });

  test("alloc 0/0/100 → no balance txs, no nav log, payout only", () => {
    const plan = calc_settlement_plan(make_input(), make_ctx());
    expect(plan.balance_txs).toHaveLength(0);
    expect(plan.nav_log_entry).toBeNull();
    expect(plan.payout?.amount).toBe(100);
  });

  test("fee allowance covers processing fee → fa_excess captured, gross unchanged", () => {
    const plan = calc_settlement_plan(
      make_input({
        ps: parts({
          sttl: amt(100),
          sttl_fee: amt(2),
          sttl_fa: amt(3),
        }),
      }),
      make_ctx()
    );
    expect(plan.dist.gross).toBe(100);
    expect(plan.dist.fee_allowance_excess).toBe(1); // 3 - 2
    expect(plan.dist.net).toBe(102); // 100 + 2 (pf covered by fa)
  });

  test("don_dist msg is always emitted, last", () => {
    const plan = calc_settlement_plan(make_input(), make_ctx());
    expect(plan.msgs.at(-1)?.id).toBe("don-dist");
  });
});

describe("shared_parts", () => {
  test("divides every amount by n", () => {
    const p = parts({
      amnt: amt(100, 10, 5),
      sttl: amt(90, 9, 4),
      sttl_fee: amt(2, 0, 0),
    });
    const out = shared_parts(p, 2);
    expect(out.amnt.base).toBe(50);
    expect(out.amnt.tip).toBe(5);
    expect(out.sttl.base).toBe(45);
    expect(out.sttl_fee.base).toBe(1);
  });
});
