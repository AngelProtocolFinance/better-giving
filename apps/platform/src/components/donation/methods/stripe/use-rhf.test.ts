import { describe, expect, test, vi } from "vitest";
import { to_atomic_c } from "#/helpers/stripe";
import { payment_intent } from "#/routes/api.donation-intents/stripe/payment-intent";
import type { ICurrencyFv } from "#/types/currency";
import { MIN_DONATION_USD } from "@/constants/common";
import type { TTipFormat } from "../../types";
import { stripe_express_partial, stripe_express_priced } from "./use-rhf";

const pi_create_mock = vi.hoisted(() =>
  vi.fn(async () => ({ client_secret: "pi_secret" }))
);
vi.mock("$/kit/stripe", () => ({
  stripe: { paymentIntents: { create: pi_create_mock } },
}));

/** the shape `to_currencies_fv` builds: min is our own usd floor, fx'd */
const curr = (code: string, rate: number): ICurrencyFv => ({
  code,
  rate,
  min: Math.ceil(rate * MIN_DONATION_USD),
});

describe("stripe_express_partial", () => {
  // the element is created with total_atomic, and stripe rejects an amount
  // under its own per-currency floor — which we carry no table for.
  test.each([
    // usd, and the two shapes to_atomic_c treats specially
    ["USD", 1, 200],
    // three-decimal: stripe also wants a multiple of 10
    ["TND", 3.1, 7000],
    // zero-decimal
    ["JPY", 157, 314],
  ])("%s mounts at the form's minimum", (code, rate, atomic) => {
    const c = curr(code, rate);
    const p = stripe_express_partial(c, "one-time");

    expect(p.total_atomic).toBe(atomic);
    expect(p.total_atomic).toBe(to_atomic_c(code)(c.min));
    expect(p.is_partial).toBe(true);
  });

  // the bug this guards: mounting at c.rate is 1 usd-equivalent, which can
  // fall under stripe's floor for the currency
  test("never mounts at one usd-equivalent", () => {
    const c = curr("TND", 3.1);
    expect(stripe_express_partial(c, "one-time").total).not.toBe(c.rate);
    expect(stripe_express_partial(c, "one-time").total).toBe(c.min);
  });

  // base/total are currency units and total_usd is their usd value, the same
  // way the non-partial path derives them
  test("carries coherent units", () => {
    const c = curr("TND", 3.1);
    const p = stripe_express_partial(c, "one-time");

    expect(p.base).toBe(c.min);
    expect(p.total).toBe(c.min);
    expect(p.total_usd).toBeGreaterThanOrEqual(MIN_DONATION_USD);
    expect(p.total_usd).toBeCloseTo(c.min / c.rate);
    expect(p.currency).toBe("tnd");
  });
});

describe("stripe_express_priced", () => {
  // the element authorizes total_atomic; the server charges the intent it
  // creates from the same base, tip and fee allowance
  test("the express total is the payment intent amount, fee covered", async () => {
    const tip_formats: TTipFormat[] = ["none", "10", "15", "20"];
    const bases = [
      ...Array.from({ length: 200 }, (_, i) => i + 1),
      ...Array.from({ length: 150 }, (_, i) => (100 + i * 13) / 100),
    ];
    const off: string[] = [];
    for (const c of [curr("USD", 1), curr("EUR", 0.92)]) {
      for (const tip_format of tip_formats) {
        for (const amount of bases) {
          const x = stripe_express_priced(c, "one-time", {
            amount,
            tip_format,
            tip: "",
            cover_processing_fee: true,
          });
          pi_create_mock.mockClear();
          await payment_intent({
            base: x.base,
            tip: x.tip,
            fee_allowance: x.fee_allowance,
            currency: c.code,
            order_id: "o_1",
            customer_id: "cus_1",
          });
          const [params] = pi_create_mock.mock.calls[0] as unknown as [
            { amount: number },
          ];
          if (params.amount !== x.total_atomic) {
            off.push(
              `${c.code} ${amount} tip ${tip_format}: ${x.total_atomic}/${params.amount}`
            );
          }
        }
      }
    }
    expect(off.slice(0, 5)).toEqual([]);
  });
});
