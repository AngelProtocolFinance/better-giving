import { describe, expect, test } from "vitest";
import { to_amount, to_amount_shares, to_receipt } from "./email";

const values = (xs: { value: number }[]) => xs.map((x) => x.value);
const usds = (xs: { value_usd: number }[]) => xs.map((x) => x.value_usd);
/** summed in the printed unit, so float addition can't fake a match */
const cents = (xs: number[], scale = 100) =>
  xs.reduce((s, x) => s + Math.round(x * scale), 0);

describe("to_amount_shares", () => {
  test("a btc gift's shares print usd that adds up to the whole", () => {
    // 0.001 btc at $100k: btc prints 2 decimals, so each token share is 0
    const shares = to_amount_shares(0.001, 100, "BTC", 3);

    expect(usds(shares)).toEqual([33.34, 33.33, 33.33]);
  });

  test("a non-usd gift's usd shares add up to the whole's usd", () => {
    // €100 at 0.9 eur per usd prints approx. 111.11 usd
    const shares = to_amount_shares(100, 100 / 0.9, "EUR", 3);

    expect(usds(shares)).toEqual([37.04, 37.04, 37.03]);
  });

  test("hands the cent a truncated third drops to the first share", () => {
    expect(values(to_amount_shares(100, 100, "USD", 3))).toEqual([
      33.34, 33.33, 33.33,
    ]);
  });

  test("splits a crypto amount in the smallest unit it prints", () => {
    // 4 DOGE per usd prints one decimal
    const shares = to_amount_shares(100, 25, "DOGE", 3);

    expect(values(shares)).toEqual([33.4, 33.3, 33.3]);
    expect(usds(shares)).toEqual([8.34, 8.33, 8.33]);
    expect(shares.every((s) => s.currency === "DOGE")).toBe(true);
  });

  test("splits whole units where the currency prints no decimals", () => {
    expect(values(to_amount_shares(100, 0.001, "SHIB", 3))).toEqual([
      34, 33, 33,
    ]);
  });

  test("a printed total landing above its integer in binary keeps its units", () => {
    // 1.1 * 100 is 110.00000000000001: unrounded, the first share takes a
    // cent that isn't there
    expect(values(to_amount_shares(1.1, 1.1, "USD", 2))).toEqual([0.55, 0.55]);
  });

  test.each([
    [100, 100, "USD", 3],
    [0.29, 0.29, "USD", 2],
    [100, 100 / 0.92, "EUR", 3],
    [100, 25, "DOGE", 7],
    [0.1, 300, "ETH", 3],
    [0.0015, 150, "BTC", 3],
  ] as const)(
    "%s %s (%s usd) over %s prints what the whole prints",
    (amount, usd, denom, n) => {
      const whole = to_amount(amount, usd, denom);
      const shares = to_amount_shares(amount, usd, denom, n);

      expect(cents(values(shares), 1e8)).toBe(Math.round(whole.value * 1e8));
      expect(cents(usds(shares))).toBe(Math.round(whole.value_usd * 100));
    }
  );
});

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
  /** each line as the receipt prints it, in order */
  const printed = (r: ReturnType<typeof to_receipt>) =>
    r.lines.map((l) => [l.kind, l.name, l.amount.value]);

  test("a tipped fund gift is one receipt: a line per member, then the tip", () => {
    const r = to_receipt(
      don({ amount: { base: 100, tip: 5, fee_allowance: 0 } }),
      [10, 11, 12],
      [npo(10, "Alpha"), npo(11, "Beta"), npo(12, "Gamma")],
      ctx
    );

    expect(printed(r)).toEqual([
      ["beneficiary", "Alpha", 33.34],
      ["beneficiary", "Beta", 33.33],
      ["beneficiary", "Gamma", 33.33],
      ["tip", "Better Giving", 5],
    ]);
    expect(r.amount).toEqual({ value: 105, currency: "USD", value_usd: 105 });
    expect(r.tax_receipt_id).toBe("R-1");
    expect(r.to_name).toBe("Climate Fund");
  });

  test("a recipient inactive since settlement still gets its line and share", () => {
    // settlement paid beta; the receipt states the gift it was paid from, and
    // activity is the caller's rule: the builder receipts the ids it is given
    const r = to_receipt(
      don(),
      [10, 11, 12],
      [npo(10, "Alpha"), npo(11, "Beta", false), npo(12, "Gamma")],
      ctx
    );

    expect(printed(r)).toEqual([
      ["beneficiary", "Alpha", 33.34],
      ["beneficiary", "Beta", 33.33],
      ["beneficiary", "Gamma", 33.33],
    ]);
  });

  test("a member outside the recipient set gets no line", () => {
    const r = to_receipt(
      don(),
      [10, 12],
      [npo(10, "Alpha"), npo(11, "Beta"), npo(12, "Gamma")],
      ctx
    );

    expect(printed(r)).toEqual([
      ["beneficiary", "Alpha", 50],
      ["beneficiary", "Gamma", 50],
    ]);
  });

  test("recipients are listed in id order whatever order they arrive in", () => {
    const r = to_receipt(
      don(),
      [12, 10, 11],
      [npo(11, "Beta"), npo(12, "Gamma"), npo(10, "Alpha")],
      ctx
    );

    // the first member takes the leftover cent, so a send, its retry and a
    // resend must agree on who is first
    expect(printed(r)).toEqual([
      ["beneficiary", "Alpha", 33.34],
      ["beneficiary", "Beta", 33.33],
      ["beneficiary", "Gamma", 33.33],
    ]);
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

  test("a fund with better giving among its members is not a gift to better giving", () => {
    const r = to_receipt(
      don(),
      [1, 10],
      [npo(1, "Better Giving"), npo(10, "Alpha")],
      ctx
    );

    expect(r.is_bg).toBeFalsy();
    expect(r.to_name).toBe("Climate Fund");
  });

  test.each([
    [1, 1, 0.6, "EUR"],
    [100, 5, 0.9, "EUR"],
    [0.05, 0.01, 0.00001, "BTC"],
    [100, 7, 4, "DOGE"],
  ] as const)(
    "%s + %s tip at %s %s per usd: the lines add up to the total",
    (base, tip, upusd, currency) => {
      const r = to_receipt(
        don({ amount: { base, tip, fee_allowance: 0 }, upusd, currency }),
        [10, 11, 12],
        [npo(10, "Alpha"), npo(11, "Beta"), npo(12, "Gamma")],
        ctx
      );
      const amounts = r.lines.map((l) => l.amount);

      // the total is what the donor paid; a receipt whose rows miss it by a
      // cent reads as money no line accounts for
      expect(r.amount).toEqual(
        to_amount(base + tip, (base + tip) / upusd, currency)
      );
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
