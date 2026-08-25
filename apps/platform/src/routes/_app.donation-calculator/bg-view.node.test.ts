import { describe, expect, test } from "vitest";
import { ogInputDefault } from "#/types/donation-calculator";
import { bgView } from "./bg-view";

// node project, not browser: a pure fn of `OgInput` — no request, no dom.
describe("bgView", () => {
  // result1's "Donation Processing Impact Details" block renders these three
  // figures with `<Usd sign>`, which paints a positive number green with a
  // leading `+`. that styling is only honest while all three are additive
  // terms of `advantage` — the subscription in particular is a cost the org
  // stops paying, not one it takes on. flip any of them to a deduction and
  // this fails before the row's wording does.
  test("advantage is the sum of the three figures the details block shows", () => {
    const v = bgView({ ...ogInputDefault, subsCost: 1200, donMethods: [] });

    expect(v.ogSubsCost).toBe(1200);
    expect(v.ogMissedFromDonTypes).toBeGreaterThan(0);
    expect(v.feeSavings).toBeGreaterThan(0);
    expect(v.advantage).toBeCloseTo(
      v.feeSavings + v.ogMissedFromDonTypes + v.ogSubsCost
    );
  });

  // the same subscription is a deduction on the "Current Amount Received"
  // side, where it renders negative and red. both readings are correct and
  // they are what make the sign meaningful in each place.
  test("the subscription is deducted from what the current setup nets", () => {
    const v = bgView({ ...ogInputDefault, subsCost: 1200 });

    expect(v.ogDeductions).toBeCloseTo(v.ogFees + 1200);
    expect(v.ogNet).toBeCloseTo(v.amount - v.ogDeductions);
  });
});
