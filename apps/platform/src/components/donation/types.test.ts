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
      ["custodian", "Keep it to 100 characters"],
    ]);
  });

  test("exactly 100 characters is accepted", () => {
    expect(parse("a".repeat(100)).success).toBe(true);
  });

  // the form's resolver aborts the pipe early, so the donor reads the first
  const first_issue = (custodian: string) => {
    const i = parse(custodian).issues?.[0];
    return i && [v.getDotPath(i), i.message];
  };

  test.each([
    ["sentence text", "URGENT wire update, see https://evil.invalid/pay"],
    ["an email", "ops@evil.invalid"],
    ["a hash", "Fidelity #2"],
  ])("%s is refused at the field with what it takes", (_, custodian) => {
    expect(first_issue(custodian)).toEqual([
      "custodian",
      "Use letters, numbers, spaces and & ' . , ( ) * / - only",
    ]);
  });

  test.each([
    ["a bare host", "evil.com"],
    ["a host and path", "evil.com/pay"],
  ])("%s is refused at the field as a web address", (_, custodian) => {
    expect(first_issue(custodian)).toEqual([
      "custodian",
      "Enter the firm's name, not a web address",
    ]);
  });

  test.each([
    "Charles Schwab & Co., Inc.",
    "T. Rowe Price",
    "Crédit Agricole",
    "E*Trade",
    "BNY Mellon/Pershing",
  ])("%s is accepted", (custodian) => {
    expect(parse(custodian).success).toBe(true);
  });

  // ios smart punctuation types ’ for ' by default
  test.each([
    ["a right", "Charles Schwab’s Trust Co.", "Charles Schwab's Trust Co."],
    ["a left", "‘Schwab’ Trust Co.", "'Schwab' Trust Co."],
  ])("%s curly apostrophe is sent as a straight one", (_, custodian, sent) => {
    const r = parse(custodian);
    expect(r.success).toBe(true);
    expect(r.output).toMatchObject({ custodian: sent });
  });
});

describe("donation amount precision", () => {
  const stripe = (amount: string, code: string, rate: number, min = 1) =>
    v.safeParse(stripe_donation_details, {
      amount,
      currency: { code, rate, min },
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
    // × 100 drifts off the integer: 28.999999999999996, 1998.9999999999998
    expect(stripe("0.29", "USD", 1, 0).success).toBe(true);
    expect(stripe("19.99", "USD", 1).success).toBe(true);
  });

  // min 0 turns the minimum off, so only the precision rule can refuse
  test("every whole-cent card amount up to $200 is accepted", () => {
    const refused: string[] = [];
    for (let cents = 1; cents <= 20_000; cents++) {
      const amount = String(cents / 100);
      if (!stripe(amount, "USD", 1, 0).success) refused.push(amount);
    }
    expect(refused).toEqual([]);
  });

  test("a zero-decimal currency takes whole units only", () => {
    expect(field_issues(stripe("1000.5", "JPY", 150))).toEqual([
      ["amount", "must be a whole number"],
    ]);
    expect(stripe("1000", "JPY", 150).success).toBe(true);
  });

  // a cad is worth under a usd, which the usd-magnitude rule printed at 1 decimal
  test.each([
    ["CAD", 1.37, 1.37, "1.37"],
    ["MXN", 17.2, 34.567, "34.57"],
    ["JPY", 150, 299.2, "300"],
    ["USD", 1, 2, "2.00"],
    // stripe takes these whole though iso 4217 gives them 2 decimals
    ["HUF", 360, 700.4, "701"],
    ["TWD", 32, 64.3, "65"],
  ])("a %s minimum prints at its card precision", (code, rate, min, shown) => {
    expect(field_issues(stripe("1", code, rate, min))).toEqual([
      ["amount", `minimum of ${shown} ${code}`],
    ]);
  });

  test.each(["10.5", "0.01", "25.001"])(
    "a daf grant of %s is refused: grants are whole dollars",
    (amount) => {
      expect(field_issues(daf(amount))).toEqual([
        ["amount", "must be a whole dollar amount"],
      ]);
    }
  );

  test("a daf grant in whole dollars is accepted", () => {
    expect(daf("25").success).toBe(true);
    expect(daf("25.00").success).toBe(true);
  });
});
