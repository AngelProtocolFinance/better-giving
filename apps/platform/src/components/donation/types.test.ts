import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
  daf_donation_details,
  ira_qcd_donation_details,
  stripe_donation_details,
  tip_from_val,
  tip_val,
} from "./types";

describe("tip_from_val", () => {
  test.each([
    ["15", 15],
    ["20", 20],
    ["10", 10],
  ])("a %s%% tip is recognised as a percentage", (format, tip) => {
    expect(tip_from_val(tip, 100)).toEqual({ tip_format: format, tip: "" });
  });

  test("an amount matching no percentage is custom", () => {
    expect(tip_from_val(17, 100)).toEqual({ tip_format: "custom", tip: "17" });
  });

  test("recognition is on the ratio, not the amount", () => {
    expect(tip_from_val(4.5, 30)).toEqual({ tip_format: "15", tip: "" });
  });

  test("a zero base cannot yield a ratio, so it is custom", () => {
    expect(tip_from_val(0, 0)).toEqual({ tip_format: "custom", tip: "0" });
  });

  test("round-trips through tip_val for every recognised percentage", () => {
    for (const pct of [10, 15, 20]) {
      const base = 250;
      const tip = (pct / 100) * base;
      const fv = tip_from_val(tip, base);
      expect(tip_val(fv.tip_format, fv.tip, base)).toBeCloseTo(tip);
    }
  });
});

describe("donation amount", () => {
  const daf = (amount: string) =>
    v.safeParse(daf_donation_details, {
      amount,
      tip: "",
      tip_format: "none",
      cover_processing_fee: false,
    });
  const ira = (amount: string) =>
    v.safeParse(ira_qcd_donation_details, {
      amount,
      tip: "",
      tip_format: "none",
    });

  test.each([
    ["daf", daf],
    ["ira-qcd", ira],
  ])("%s rejects a zero amount", (_, parse) => {
    const r = parse("0");
    expect(r.success).toBe(false);
    expect(r.issues?.[0].message).toBe("amount must be greater than 0");
  });

  test.each([
    ["daf", daf],
    ["ira-qcd", ira],
  ])("%s rejects a negative amount", (_, parse) => {
    expect(parse("-5").success).toBe(false);
  });

  test.each([
    ["daf", daf],
    ["ira-qcd", ira],
  ])("%s accepts a positive amount", (_, parse) => {
    const r = parse("25");
    expect(r.success).toBe(true);
    expect(r.output).toMatchObject({ amount: "25" });
  });
});

describe("ira-qcd custodian", () => {
  const parse = (custodian: string) =>
    v.safeParse(ira_qcd_donation_details, {
      amount: "25",
      tip: "",
      tip_format: "none",
      custodian,
    });

  test("more than 100 characters is refused at the field", () => {
    const r = parse("a".repeat(101));
    expect(r.success).toBe(false);
    expect(r.issues?.map((i) => [v.getDotPath(i), i.message])).toEqual([
      ["custodian", "can't be more than 100 characters"],
    ]);
  });

  test("exactly 100 characters is accepted", () => {
    expect(parse("a".repeat(100)).success).toBe(true);
  });
});

describe("donation amount precision", () => {
  const stripe = (amount: string, code: string, rate: number) =>
    v.safeParse(stripe_donation_details, {
      amount,
      currency: { code, rate, min: 1 },
      frequency: "one-time",
      tip: "",
      tip_format: "none",
      cover_processing_fee: false,
    });
  const daf = (amount: string) =>
    v.safeParse(daf_donation_details, {
      amount,
      tip: "",
      tip_format: "none",
      cover_processing_fee: false,
    });
  const field_issues = (r: {
    issues?: [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]];
  }) => r.issues?.map((i) => [v.getDotPath(i), i.message]);

  test("a card amount can't carry a fraction of a cent", () => {
    expect(field_issues(stripe("10.555", "USD", 1))).toEqual([
      ["amount", "can't be more than 2 decimals"],
    ]);
    expect(stripe("10.55", "USD", 1).success).toBe(true);
  });

  test("a zero-decimal currency takes whole units only", () => {
    expect(field_issues(stripe("1000.5", "JPY", 150))).toEqual([
      ["amount", "can't be more than 0 decimals"],
    ]);
    expect(stripe("1000", "JPY", 150).success).toBe(true);
  });

  test("a daf grant can't carry a fraction of a cent", () => {
    expect(field_issues(daf("0.001"))).toEqual([
      ["amount", "can't be more than 2 decimals"],
    ]);
    expect(daf("0.01").success).toBe(true);
  });
});
