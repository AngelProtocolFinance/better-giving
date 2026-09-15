import { describe, expect, it } from "vitest";
import { donation_quote } from "./min";

/** eth at $2000 */
const np = (min_amount: number, fiat_equivalent: number) => ({
  min_amount: async () => ({ min: min_amount, min_usd: fiat_equivalent }),
  estimate: async () => ({ usdpu: 2000 }),
});

describe("donation_quote", () => {
  it("a pair minimum over the $1 floor stands, plus the 3% allowance", async () => {
    const q = await donation_quote(np(0.001, 2), "ETH");
    expect(q.floor).toBe(0.001);
    expect(q.min).toBeCloseTo(0.00103, 9);
    expect(q.usdpu).toBe(2000);
  });

  it("a pair minimum under $1 is raised to $1 of the token", async () => {
    const q = await donation_quote(np(0.0001, 0.2), "ETH");
    expect(q.floor).toBeCloseTo(0.0005, 9);
    expect(q.min).toBeCloseTo(0.000515, 9);
  });
});
