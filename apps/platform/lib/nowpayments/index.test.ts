import { afterEach, describe, expect, it, vi } from "vitest";
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
const requested = (spy: ReturnType<typeof fetch_mock>, i = 0) =>
  spy.mock.calls[i][0] as Request;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("nowpayments client", () => {
  it("a non-ok response throws an Error carrying status and body", async () => {
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
    expect(err).toBeInstanceOf(Error);
    expect((err as NowpaymentsError).http_status).toBe(400);
    expect((err as NowpaymentsError).body).toBe(
      '{"message":"currency disabled"}'
    );
  });

  it("find_payment is null for a payment nowpayments answers 4xx on", async () => {
    const spy = fetch_mock().mockResolvedValueOnce(
      new Response('{"message":"payment not found"}', { status: 404 })
    );
    expect(await client.find_payment(777)).toBeNull();
    expect(new URL(requested(spy).url).pathname).toBe("/v1/payment/777");
  });

  it("find_payment throws on a nowpayments 5xx", async () => {
    fetch_mock().mockResolvedValueOnce(new Response("", { status: 503 }));
    const err = await client.find_payment(777).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NowpaymentsError);
    expect((err as NowpaymentsError).http_status).toBe(503);
  });

  it("estimate reads usd per unit off /v1/estimate", async () => {
    const spy = fetch_mock().mockResolvedValueOnce(
      Response.json({
        currency_from: "usd",
        amount_from: 100,
        currency_to: "eth",
        estimated_amount: 0.05,
      })
    );
    const { usdpu } = await client.estimate("ETH");

    expect(usdpu).toBe(2000);
    const url = new URL(requested(spy).url);
    expect(url.pathname).toBe("/v1/estimate");
    expect(url.searchParams.get("currency_from")).toBe("usd");
    expect(url.searchParams.get("currency_to")).toBe("ETH");
  });

  it.each([
    ["a zero estimated_amount", { amount_from: 100, estimated_amount: 0 }],
    ["no estimated_amount", { amount_from: 100 }],
    ["a negative estimated_amount", { amount_from: 100, estimated_amount: -1 }],
    [
      "a string estimated_amount",
      { amount_from: 100, estimated_amount: "0.05" },
    ],
  ])(
    "estimate throws on %s rather than return a usd rate of Infinity or NaN",
    async (_, body) => {
      fetch_mock().mockResolvedValueOnce(Response.json(body));
      const err = await client.estimate("ETH").catch((e: unknown) => e);
      // the same "pair not payable" an unusable minimum is, not an outage
      expect(err).toBeInstanceOf(NowpaymentsNotPayableError);
      expect((err as Error).message).toContain("v1/estimate");
    }
  );

  it.each([
    ["no fiat_equivalent", { min_amount: 0.001 }],
    ["a zero fiat_equivalent", { min_amount: 0.001, fiat_equivalent: 0 }],
    ["a zero min_amount", { min_amount: 0, fiat_equivalent: 2 }],
    ["a string min_amount", { min_amount: "0.001", fiat_equivalent: 2 }],
  ])(
    "min_amount throws on %s rather than return a minimum that passes every check",
    async (_, body) => {
      fetch_mock().mockResolvedValueOnce(Response.json(body));
      const err = await client.min_amount("ETH").catch((e: unknown) => e);
      // a 200 with an unusable quote is "pair not payable", not an http outage
      expect(err).toBeInstanceOf(NowpaymentsNotPayableError);
      expect(err).not.toBeInstanceOf(NowpaymentsError);
      expect((err as Error).name).toBe("NowpaymentsNotPayableError");
      expect((err as Error).message).toContain("v1/min-amount");
      expect((err as Error).message).toContain("ETH");
    }
  );

  it("min_amount returns both figures when the quote is usable", async () => {
    fetch_mock().mockResolvedValueOnce(
      Response.json({ min_amount: 0.001, fiat_equivalent: 2 })
    );
    expect(await client.min_amount("ETH")).toEqual({ min: 0.001, min_usd: 2 });
  });

  it("min_amount quotes the token against the account's polygon usdc outcome, not against itself", async () => {
    const spy = fetch_mock().mockResolvedValueOnce(
      Response.json({ min_amount: 0.001, fiat_equivalent: 2 })
    );
    await client.min_amount("ETH");

    const url = new URL(requested(spy).url);
    expect(url.pathname).toBe("/v1/min-amount");
    expect(url.searchParams.get("currency_from")).toBe("ETH");
    expect(url.searchParams.get("currency_to")).toBe("usdcmatic");
    expect(url.searchParams.get("fiat_equivalent")).toBe("usd");
  });

  it("every request carries a 10s timeout", async () => {
    const ctl = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(ctl.signal);
    const spy = fetch_mock().mockResolvedValueOnce(
      Response.json({ min_amount: 1, fiat_equivalent: 1 })
    );
    await client.min_amount("ETH");

    expect(timeout).toHaveBeenCalledWith(10_000);
    const { signal } = requested(spy);
    expect(signal.aborted).toBe(false);
    ctl.abort();
    expect(signal.aborted).toBe(true);
  });
});
