import { describe, expect, test } from "vitest";
import { str_id, to_atomic_c } from "../stripe";

describe("to_atomic_c", () => {
  test("converts standard 2-decimal currencies correctly", () => {
    expect(to_atomic_c("USD")(10.5)).toBe(1050);
    expect(to_atomic_c("EUR")(100)).toBe(10000);
    expect(to_atomic_c("GBP")(1.23)).toBe(123);
    expect(to_atomic_c("CAD")(0.01)).toBe(1);
    expect(to_atomic_c("AUD")(99.99)).toBe(9999);
  });

  test("converts zero-decimal currencies correctly", () => {
    expect(to_atomic_c("JPY")(1000)).toBe(1000);
    expect(to_atomic_c("KRW")(5000)).toBe(5000);
    expect(to_atomic_c("VND")(100)).toBe(100);
    expect(to_atomic_c("CLP")(1)).toBe(1);
    expect(to_atomic_c("XOF")(250)).toBe(250);
  });

  test("handles currency code case insensitivity", () => {
    expect(to_atomic_c("usd")(10.5)).toBe(1050);
    expect(to_atomic_c("USD")(10.5)).toBe(1050);
    expect(to_atomic_c("UsD")(10.5)).toBe(1050);
    expect(to_atomic_c("jpy")(1000)).toBe(1000);
  });

  test("truncates correctly after rounding", () => {
    // round_number rounds, then Math.trunc truncates the result
    expect(to_atomic_c("USD")(10.555)).toBe(1055);
    expect(to_atomic_c("USD")(10.554)).toBe(1055);
    expect(to_atomic_c("USD")(10.556)).toBe(1055);
  });

  test("handles zero and negative amounts", () => {
    expect(to_atomic_c("USD")(0)).toBe(0);
    expect(to_atomic_c("USD")(-10.5)).toBe(-1050);
    expect(to_atomic_c("JPY")(-100)).toBe(-100);
  });

  test("handles fractional cents correctly", () => {
    expect(to_atomic_c("USD")(10.999)).toBe(1099);
    expect(to_atomic_c("USD")(10.991)).toBe(1099);
    expect(to_atomic_c("USD")(10.001)).toBe(1000);
    expect(to_atomic_c("USD")(0.005)).toBe(0);
    expect(to_atomic_c("USD")(0.004)).toBe(0);
  });

  test("handles large amounts", () => {
    expect(to_atomic_c("USD")(1000000)).toBe(100000000);
    expect(to_atomic_c("EUR")(999999.99)).toBe(99999999);
    expect(to_atomic_c("JPY")(1000000)).toBe(1000000);
  });

  test("defaults to 2 decimals for unknown currencies", () => {
    expect(to_atomic_c("XXX")(10.5)).toBe(1050);
    expect(to_atomic_c("UNKNOWN")(100)).toBe(10000);
  });

  test("handles all zero-decimal currencies", () => {
    const zeroCurrencies = [
      "BIF",
      "CLP",
      "DJF",
      "GNF",
      "JPY",
      "KMF",
      "KRW",
      "MGA",
      "PYG",
      "RWF",
      "VND",
      "VUV",
      "XAF",
      "XOF",
      "XPF",
    ];
    for (const currency of zeroCurrencies) {
      expect(to_atomic_c(currency)(100)).toBe(100);
    }
  });

  test("handles special case currencies", () => {
    // ISK - zero-decimal but represented as two-decimal (always 00)
    // To charge 5 ISK, provide amount value of 500
    expect(to_atomic_c("ISK")(5)).toBe(500);
    expect(to_atomic_c("ISK")(100)).toBe(10000);
    expect(to_atomic_c("ISK")(1)).toBe(100);
    expect(to_atomic_c("ISK")(10.5)).toBe(1000); // rounds down to 10, then * 100

    // HUF - zero-decimal for payouts, but represented as two-decimal
    // 10 HUF should be 1000, must be divisible by 100
    expect(to_atomic_c("HUF")(10)).toBe(1000);
    expect(to_atomic_c("HUF")(100)).toBe(10000);
    expect(to_atomic_c("HUF")(10.45)).toBe(1000); // rounds down to 10, then * 100

    // TWD - zero-decimal for payouts, but represented as two-decimal
    // 800 TWD should be 80000, must be divisible by 100
    expect(to_atomic_c("TWD")(800)).toBe(80000);
    expect(to_atomic_c("TWD")(100)).toBe(10000);
    expect(to_atomic_c("TWD")(800.45)).toBe(80000); // rounds down to 800, then * 100

    // UGX - zero-decimal but represented as two-decimal (always 00)
    // To charge 5 UGX, provide amount value of 500
    expect(to_atomic_c("UGX")(5)).toBe(500);
    expect(to_atomic_c("UGX")(100)).toBe(10000);
    expect(to_atomic_c("UGX")(1)).toBe(100);
    expect(to_atomic_c("UGX")(10.5)).toBe(1000); // rounds down to 10, then * 100
  });

  test("special case currencies cannot charge fractions", () => {
    // ISK and UGX can't charge fractions - they round DOWN to integer first
    expect(to_atomic_c("ISK")(5.4)).toBe(500); // rounds down to 5
    expect(to_atomic_c("ISK")(5.6)).toBe(500); // rounds down to 5
    expect(to_atomic_c("UGX")(5.4)).toBe(500); // rounds down to 5
    expect(to_atomic_c("UGX")(5.6)).toBe(500); // rounds down to 5

    // HUF and TWD also round DOWN to integers first (zero-decimal precision)
    expect(to_atomic_c("HUF")(10.4)).toBe(1000); // rounds down to 10
    expect(to_atomic_c("HUF")(10.6)).toBe(1000); // rounds down to 10
    expect(to_atomic_c("TWD")(100.4)).toBe(10000); // rounds down to 100
    expect(to_atomic_c("TWD")(100.6)).toBe(10000); // rounds down to 100
  });
});

describe("str_id", () => {
  test("returns string ID when given a string", () => {
    expect(str_id("pm_123abc")).toBe("pm_123abc");
    expect(str_id("card_xyz")).toBe("card_xyz");
  });

  test("extracts ID from object with id property", () => {
    expect(str_id({ id: "pm_123abc" })).toBe("pm_123abc");
    expect(str_id({ id: "card_xyz" })).toBe("card_xyz");
  });

  test("throws error for null input", () => {
    expect(() => str_id(null)).toThrow("invalid payment method ID: null");
  });

  test("throws error for undefined input", () => {
    // @ts-expect-error - testing runtime behavior
    expect(() => str_id(undefined)).toThrow(
      "invalid payment method ID: undefined"
    );
  });

  test("throws error for falsy values", () => {
    // @ts-expect-error - testing runtime behavior
    expect(() => str_id(0)).toThrow("invalid payment method ID: 0");
    // @ts-expect-error - testing runtime behavior
    expect(() => str_id(false)).toThrow("invalid payment method ID: false");
  });
});
