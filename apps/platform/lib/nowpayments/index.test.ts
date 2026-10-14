import { afterEach, describe, expect, it, vi } from "vitest";
import {
  estimate_price,
  min_amount,
  with_decimal_strings,
} from "./fixtures/examples";
import {
  Nowpayments,
  NowpaymentsError,
  NowpaymentsNotPayableError,
} from "./index";

const client = new Nowpayments({
  baseUrl: "https://api-sandbox.nowpayments.io",
  apiToken: "key",
});

const fetch_mock = () => vi.spyOn(globalThis, "fetch");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("nowpayments client", () => {
  it("a disabled currency is an error carrying the status and body", async () => {
    fetch_mock().mockResolvedValueOnce(
      new Response('{"message":"currency disabled"}', { status: 400 })
    );
    const err = await client
      .invoice({
        price_amount: 10,
        price_currency: "usd",
        pay_currency: "eth",
        ipn_callback_url: "https://x/api/nowpayments-webhook",
        order_id: "o-1",
        order_description: "d",
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NowpaymentsError);
    expect((err as NowpaymentsError).http_status).toBe(400);
    expect((err as NowpaymentsError).body).toBe(
      '{"message":"currency disabled"}'
    );
  });

  it("an unknown payment is null", async () => {
    fetch_mock().mockResolvedValueOnce(
      new Response('{"message":"payment not found"}', { status: 404 })
    );
    expect(await client.find_payment(777)).toBeNull();
  });

  it("a nowpayments outage while loading a payment is an error", async () => {
    fetch_mock().mockResolvedValueOnce(new Response("", { status: 503 }));
    const err = await client.find_payment(777).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NowpaymentsError);
    expect((err as NowpaymentsError).http_status).toBe(503);
  });

  // Get estimated price, 200. 3999.5 USD buys 0.17061637 BTC.
  it.each([
    ["json numbers", estimate_price],
    [
      "decimal strings",
      with_decimal_strings(estimate_price, ["amount_from", "estimated_amount"]),
    ],
  ])("a documented estimate quoted as %s prices the token", async (_, body) => {
    fetch_mock().mockResolvedValueOnce(Response.json(body));
    expect(await client.estimate("btc")).toEqual({ usdpu: 23441.478681090215 });
  });

  // Get the minimum payment amount, 200.
  it.each([
    ["json numbers", min_amount],
    [
      "decimal strings",
      with_decimal_strings(min_amount, ["min_amount", "fiat_equivalent"]),
    ],
  ])(
    "a documented minimum quoted as %s is the pair minimum",
    async (_, body) => {
      fetch_mock().mockResolvedValueOnce(Response.json(body));
      expect(await client.min_amount("eth")).toEqual({
        min: 0.0078999,
        min_usd: 35.40626584,
      });
    }
  );

  it.each([
    ["estimate", "a zero amount", { amount_from: 100, estimated_amount: 0 }],
    ["estimate", "a missing amount", { amount_from: 100 }],
    [
      "estimate",
      "a negative amount",
      { amount_from: 100, estimated_amount: -1 },
    ],
    [
      "estimate",
      "a non-numeric amount",
      { amount_from: 100, estimated_amount: "nope" },
    ],
    [
      "estimate",
      "a hex amount",
      { amount_from: 100, estimated_amount: "0x10" },
    ],
    [
      "estimate",
      "an exponent amount",
      { amount_from: 100, estimated_amount: "1e5" },
    ],
    ["estimate", "an empty amount", { amount_from: 100, estimated_amount: "" }],
    [
      "estimate",
      "a whitespace amount",
      { amount_from: 100, estimated_amount: " " },
    ],
    [
      "estimate",
      "a padded amount",
      { amount_from: 100, estimated_amount: " 0.05" },
    ],
    ["min_amount", "no fiat equivalent", { min_amount: 0.001 }],
    [
      "min_amount",
      "a zero fiat equivalent",
      { min_amount: 0.001, fiat_equivalent: 0 },
    ],
    ["min_amount", "a zero minimum", { min_amount: 0, fiat_equivalent: 2 }],
    [
      "min_amount",
      "a non-numeric minimum",
      { min_amount: "nope", fiat_equivalent: 2 },
    ],
  ] as const)("%s rejects %s", async (method, _, body) => {
    fetch_mock().mockResolvedValueOnce(Response.json(body));
    const err = await client[method]("ETH").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NowpaymentsNotPayableError);
  });
});
