import { describe, expect, test } from "vitest";
import { to_atomic_c } from "#/helpers/stripe";
import type { ICurrencyFv } from "#/types/currency";
import { MIN_DONATION_USD } from "@/constants/common";
import { stripe_express_partial } from "./use-rhf";

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
