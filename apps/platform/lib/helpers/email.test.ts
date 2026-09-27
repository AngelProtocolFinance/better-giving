import { describe, expect, test } from "vitest";
import { to_amount, to_receipt } from "./email";

const values = (xs: { value: number }[]) => xs.map((x) => x.value);
const usds = (xs: { value_usd: number }[]) => xs.map((x) => x.value_usd);
/** summed in the printed unit, so float addition can't fake a match */
const cents = (xs: number[], scale = 100) =>
  xs.reduce((s, x) => s + Math.round(x * scale), 0);

describe("to_receipt", () => {
  const don = (
    o: Partial<Parameters<typeof to_receipt>[0]> = {}
  ): Parameters<typeof to_receipt>[0] => ({
    id: "don-1",
    to_id: "fund-1",
    to_name: "Climate Fund",
    to_type: "fund",
    created_at: "2026-01-01T00:00:00.000Z",
    amount: { base: 100, tip: 0, fee_allowance: 0 },
    upusd: 1,
    currency: "USD",
    ...o,
  });
  const ctx = {
    from: { first_name: "Ada", full_name: "Ada Lovelace" },
    tax_receipt_id: "R-1",
    bg_npo_id: 1,
  };
  const npo = (
    id: number,
    name: string,
    active = true,
    receipt_msg: string | null = null
  ) => ({ id, name, active, receipt_msg });
  /** the one recipient `build_receipt` hands over for a fund: the fund itself */
  const fund_receipt = (d: ReturnType<typeof don>) =>
    to_receipt(d, [0], [{ id: 0, name: d.to_name }], ctx);
  /** each line as the receipt prints it, in order */
  const printed = (r: ReturnType<typeof to_receipt>) =>
    r.lines.map((l) => [l.kind, l.name, l.amount.value]);

  test("a tipped fund gift is one receipt: the fund, then the tip", () => {
    const r = fund_receipt(
      don({ amount: { base: 100, tip: 5, fee_allowance: 0 } })
    );

    expect(printed(r)).toEqual([
      ["beneficiary", "Climate Fund", 100],
      ["tip", "Better Giving", 5],
    ]);
    expect(r.amount).toEqual({ value: 105, currency: "USD", value_usd: 105 });
    expect(r.tax_receipt_id).toBe("R-1");
    expect(r.to_name).toBe("Climate Fund");
    expect(r.is_fund).toBe(true);
    expect(r.is_bg).toBe(false);
  });

  test("a tipped npo gift is one receipt: the npo with its message, then the tip", () => {
    const r = to_receipt(
      don({
        to_id: "20",
        to_name: "Freegan Food Foundation",
        to_type: "npo",
        program: { id: "p-1", name: "School Lunches" },
        amount: { base: 100, tip: 5, fee_allowance: 0 },
      }),
      [20],
      [npo(20, "Freegan Food Foundation", true, "Thank you, Ada!")],
      ctx
    );

    expect(r.lines).toEqual([
      {
        kind: "beneficiary",
        name: "Freegan Food Foundation",
        amount: { value: 100, currency: "USD", value_usd: 100 },
        msg: "Thank you, Ada!",
        program: "School Lunches",
      },
      {
        kind: "tip",
        name: "Better Giving",
        amount: { value: 5, currency: "USD", value_usd: 5 },
      },
    ]);
    // the program is the nonprofit's, so it prints on the nonprofit's line
    expect(r).not.toHaveProperty("program_name");
    expect(r.is_bg).toBeFalsy();
  });

  test("an untipped npo gift covering its fee: the npo, then the coverage", () => {
    const r = to_receipt(
      don({
        to_id: "20",
        to_name: "Freegan Food Foundation",
        to_type: "npo",
        amount: { base: 50, tip: 0, fee_allowance: 1.75 },
      }),
      [20],
      [npo(20, "Freegan Food Foundation")],
      ctx
    );

    expect(r.lines).toEqual([
      {
        kind: "beneficiary",
        name: "Freegan Food Foundation",
        amount: { value: 50, currency: "USD", value_usd: 50 },
        msg: undefined,
        program: undefined,
      },
      {
        kind: "fee",
        name: "Better Giving",
        amount: { value: 1.75, currency: "USD", value_usd: 1.75 },
      },
    ]);
    expect(r.amount).toEqual({
      value: 51.75,
      currency: "USD",
      value_usd: 51.75,
    });
  });

  test("a nonprofit renamed since the gift is listed under the name it was given to", () => {
    const r = to_receipt(
      don({ to_id: "20", to_name: "Freegan Food Foundation", to_type: "npo" }),
      [20],
      [npo(20, "Freegan Food Collective")],
      ctx
    );

    // a tax receipt names the beneficiary as it stood at the time of the gift
    expect(printed(r)).toEqual([
      ["beneficiary", "Freegan Food Foundation", 100],
    ]);
  });

  test("a gift to better giving itself reads as one, tip and all", () => {
    const r = to_receipt(
      don({
        to_id: "1",
        to_name: "Better Giving Inc",
        to_type: "npo",
        amount: { base: 50, tip: 5, fee_allowance: 0 },
      }),
      [1],
      [npo(1, "Better Giving Inc")],
      ctx
    );

    // the non-bg wording thanks the donor for giving "via Better Giving to
    // Better Giving"
    expect(r.is_bg).toBe(true);
    expect(r.to_name).toBe("Better Giving");
    expect(printed(r)).toEqual([
      ["beneficiary", "Better Giving", 50],
      ["tip", "Better Giving", 5],
    ]);
  });

  test.each([
    [1, 1, 0, 0.6, "EUR"],
    [100, 5, 0, 0.9, "EUR"],
    [100, 5, 3.33, 0.9, "EUR"],
    [0.05, 0.01, 0, 0.00001, "BTC"],
    [0.05, 0.01, 0.00123, 0.00001, "BTC"],
    [0.05, 0, 0.00123, 0.00001, "BTC"],
    [100, 7, 0, 4, "DOGE"],
    [100, 7, 2.9, 4, "DOGE"],
  ] as const)(
    "%s + %s tip + %s fee at %s %s per usd: the lines add up to the total",
    (base, tip, fee_allowance, upusd, currency) => {
      const r = fund_receipt(
        don({ amount: { base, tip, fee_allowance }, upusd, currency })
      );
      const amounts = r.lines.map((l) => l.amount);

      // the total is what the donor paid; a receipt whose rows miss it by a
      // cent reads as money no line accounts for
      const charged = base + tip + fee_allowance;
      expect(r.amount).toEqual(to_amount(charged, charged / upusd, currency));
      expect(cents(usds(amounts))).toBe(Math.round(r.amount.value_usd * 100));
      expect(cents(values(amounts), 1e8)).toBe(
        Math.round(r.amount.value * 1e8)
      );
    }
  );

  test("a fund with no recipient throws rather than sending nothing", () => {
    // an empty receipt would let the caller mark it sent with no gift on it
    expect(() => to_receipt(don(), [], [npo(11, "Beta")], ctx)).toThrow(
      "no recipients for donation don-1"
    );
  });
});
