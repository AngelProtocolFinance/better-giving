import { describe, expect, test } from "vitest";
import { to_amount_shares } from "./amount-shares";

const values = (xs: { value: number }[]) => xs.map((x) => x.value);

describe("to_amount_shares", () => {
  test("hands the cent a truncated third drops to the first share", () => {
    expect(values(to_amount_shares(100, 3, 1, "USD"))).toEqual([
      33.34, 33.33, 33.33,
    ]);
  });

  test("splits a crypto amount in the smallest unit it prints", () => {
    // 4 DOGE per usd prints one decimal
    const shares = to_amount_shares(100, 3, 4, "DOGE");

    expect(values(shares)).toEqual([33.4, 33.3, 33.3]);
    expect(shares.map((s) => s.value_usd)).toEqual([8.35, 8.32, 8.32]);
    expect(shares.every((s) => s.currency === "DOGE")).toBe(true);
  });

  test("splits whole units where the currency prints no decimals", () => {
    expect(values(to_amount_shares(100, 3, 100_000, "SHIB"))).toEqual([
      34, 33, 33,
    ]);
  });

  test("a total that is inexact in binary loses no unit", () => {
    expect(values(to_amount_shares(0.29, 2, 1, "USD"))).toEqual([0.15, 0.14]);
  });
});
