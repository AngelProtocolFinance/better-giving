import { describe, expect, it } from "vitest";
import { paid_amount, to_settlement } from "./payment";

const order = { amount: { base: 1, tip: 0, fee_allowance: 0 } };

const payment = (o: Record<string, unknown> = {}) =>
  ({
    payment_id: 5001,
    order_id: "don-1",
    payment_status: "finished",
    parent_payment_id: null,
    actually_paid: 0.4,
    outcome_amount: 990,
    outcome_currency: "usdc",
    fee: { currency: "usdc", depositFee: 1, serviceFee: 4, withdrawalFee: 5 },
    ...o,
  }) as any;

const DATE = "2026-09-15T00:00:00.000Z";

describe("paid_amount", () => {
  it.each([
    { is_sandbox: true, base: 1 },
    { is_sandbox: false, base: 0.4 },
  ])(
    "credits the order's own amount only on the sandbox host (sandbox: $is_sandbox)",
    ({ is_sandbox, base }) => {
      expect(paid_amount(payment(), order, is_sandbox).base).toBe(base);
    }
  );
});

describe("to_settlement", () => {
  it("records net and the three fee parts in usd at their own rates", () => {
    const { value, warnings } = to_settlement(
      payment({
        fee: {
          currency: "btc",
          depositFee: 0.00002,
          serviceFee: 0.00003,
          withdrawalFee: 0.00005,
        },
      }),
      { outcome_usdpu: 1, fee_usdpu: 50_000 },
      DATE
    );

    expect(value).toEqual({
      id: "5001",
      date: DATE,
      net: 990,
      fee: expect.closeTo(5),
      currency: "USDC",
    });
    expect(warnings).toEqual([]);
  });

  it("records a zero fee with a warning when the fee currency has no rate", () => {
    const { value, warnings } = to_settlement(
      payment(),
      { outcome_usdpu: 1, fee_usdpu: null },
      DATE
    );

    expect(value.fee).toBe(0);
    expect(warnings).toEqual([
      expect.objectContaining({ title: expect.stringMatching(/fee/i) }),
    ]);
  });

  it("records no fee and no warning for a payload without one", () => {
    const { value, warnings } = to_settlement(
      payment({ fee: null }),
      { outcome_usdpu: 1, fee_usdpu: null },
      DATE
    );

    expect(value.fee).toBe(0);
    expect(warnings).toEqual([]);
  });

  it("keeps an outcome token missing from the token map under its own code, with a warning", () => {
    const { value, warnings } = to_settlement(
      payment({ outcome_currency: "zzzusd" }),
      { outcome_usdpu: 1, fee_usdpu: 1 },
      DATE
    );

    expect(value.currency).toBe("ZZZUSD");
    expect(warnings).toEqual([
      expect.objectContaining({ title: expect.stringMatching(/token map/i) }),
    ]);
  });
});
