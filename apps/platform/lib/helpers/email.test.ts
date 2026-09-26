import { describe, expect, test } from "vitest";
import { to_amount, to_amount_shares, to_fund_receipts } from "./email";

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

describe("to_fund_receipts", () => {
  const don = (): Parameters<typeof to_fund_receipts>[0] => ({
    id: "don-1",
    to_id: "fund-1",
    created_at: "2026-01-01T00:00:00.000Z",
    amount: { base: 100, tip: 0, fee_allowance: 0 },
    upusd: 1,
    currency: "USD",
  });
  const ctx = {
    from: { first_name: "Ada", full_name: "Ada Lovelace" },
    tax_receipt_id: "R-1",
    bg_npo_id: 1,
  };
  const npo = (id: number, name: string, active = true) => ({
    id,
    name,
    active,
    receipt_msg: null,
  });
  /** what each receipt prints, in the order they are sent */
  const printed = (xs: { to_name: string; amount: { value: number } }[]) =>
    xs.map((x) => [x.to_name, x.amount.value]);

  test("a recipient inactive since settlement still gets its receipt and share", () => {
    const rs = to_fund_receipts(
      don(),
      [10, 11, 12],
      [npo(10, "Alpha"), npo(11, "Beta", false), npo(12, "Gamma")],
      ctx
    );

    // settlement paid beta; the receipt states the gift it was paid from
    expect(printed(rs)).toEqual([
      ["Alpha", 33.34],
      ["Beta", 33.33],
      ["Gamma", 33.33],
    ]);
  });

  test("an active member outside the recipient set gets no receipt", () => {
    const rs = to_fund_receipts(
      don(),
      [10, 12],
      [npo(10, "Alpha"), npo(11, "Beta"), npo(12, "Gamma")],
      ctx
    );

    expect(printed(rs)).toEqual([
      ["Alpha", 50],
      ["Gamma", 50],
    ]);
  });

  test("recipients are receipted in id order whatever order they arrive in", () => {
    const rs = to_fund_receipts(
      don(),
      [12, 10, 11],
      [npo(11, "Beta"), npo(12, "Gamma"), npo(10, "Alpha")],
      ctx
    );

    // the first member takes the leftover cent, so a send, its retry and a
    // resend must agree on who is first
    expect(printed(rs)).toEqual([
      ["Alpha", 33.34],
      ["Beta", 33.33],
      ["Gamma", 33.33],
    ]);
  });

  test("a fund with no recipient throws rather than sending nothing", () => {
    // an empty list would let the caller mark the receipt sent with no mail out
    expect(() => to_fund_receipts(don(), [], [npo(11, "Beta")], ctx)).toThrow(
      "fund-1"
    );
  });
});
