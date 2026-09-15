import { afterEach, describe, expect, it, vi } from "vitest";
import { Nowpayments, NowpaymentsError } from "./index";

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
