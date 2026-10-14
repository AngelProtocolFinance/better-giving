import { afterEach, describe, expect, it, vi } from "vitest";
import {
  create_invoice,
  create_payment,
  estimate_price,
  ipn_payment,
  min_amount,
  payment_status,
  with_decimal_strings,
} from "./fixtures/examples";
import {
  Nowpayments,
  NowpaymentsError,
  NowpaymentsNotPayableError,
} from "./index";
import type { NP } from "./types";

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

describe("published examples", () => {
  it("assign to the response types, amounts included", () => {
    const estimate: NP.Estimate = estimate_price;
    const minimum: NP.MinAmount = min_amount;
    const invoice: NP.Invoice = create_invoice;
    // json imports type every string as `string`, so the status literal is
    // restated; the expect below keeps it the example's own value
    const created: NP.NewPayment = {
      ...create_payment,
      payment_status: "waiting",
    };
    const status: NP.PaymentStatus = {
      ...payment_status,
      payment_status: "finished",
    };
    const ipn: NP.PaymentPayload = {
      ...ipn_payment,
      payment_status: "finished",
    };
    expect(create_payment.payment_status).toBe(created.payment_status);
    expect(payment_status.payment_status).toBe(status.payment_status);
    expect(ipn_payment.payment_status).toBe(ipn.payment_status);

    expect(estimate.estimated_amount).toBe(0.17061637);
    expect(minimum.min_amount).toBe(0.0078999);
    expect(invoice.price_amount).toBe("1000");
    expect(created.pay_amount).toBe(0.17070286);
    expect(created.network_precision).toBe(8);
    expect(status.purchase_id).toBe(5312822613);
    expect(status.burning_percent).toBe("null");
    expect(payment_status.payment_extra_ids).toEqual([5513339153]);
    expect(ipn.purchase_id).toBe("123456789");
    expect(ipn.fee.depositFee).toBe(0.09853637216235617);
  });
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

  it("estimate reads usd per unit off the documented /v1/estimate example", async () => {
    const spy = fetch_mock().mockResolvedValueOnce(
      Response.json(estimate_price)
    );
    const { usdpu } = await client.estimate("btc");

    expect(usdpu).toBe(
      Number(estimate_price.amount_from) /
        Number(estimate_price.estimated_amount)
    );
    const url = new URL(requested(spy).url);
    expect(url.pathname).toBe("/v1/estimate");
    expect(url.searchParams.get("currency_from")).toBe("usd");
    expect(url.searchParams.get("currency_to")).toBe("btc");
  });

  it("estimate reads the documented quote when the amounts are decimal strings", async () => {
    fetch_mock().mockResolvedValueOnce(
      Response.json(
        with_decimal_strings(estimate_price, [
          "amount_from",
          "estimated_amount",
        ])
      )
    );
    expect(await client.estimate("btc")).toEqual({
      usdpu:
        Number(estimate_price.amount_from) /
        Number(estimate_price.estimated_amount),
    });
  });

  it.each([
    ["a zero estimated_amount", { amount_from: 100, estimated_amount: 0 }],
    ["no estimated_amount", { amount_from: 100 }],
    ["a negative estimated_amount", { amount_from: 100, estimated_amount: -1 }],
    [
      "a non-numeric estimated_amount",
      { amount_from: 100, estimated_amount: "nope" },
    ],
    ["a hex estimated_amount", { amount_from: 100, estimated_amount: "0x10" }],
    [
      "an exponent estimated_amount",
      { amount_from: 100, estimated_amount: "1e5" },
    ],
    ["an empty estimated_amount", { amount_from: 100, estimated_amount: "" }],
    [
      "a whitespace estimated_amount",
      { amount_from: 100, estimated_amount: " " },
    ],
    [
      "a padded estimated_amount",
      { amount_from: 100, estimated_amount: " 0.05" },
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

  it("min_amount reads the documented quote when the amounts are decimal strings", async () => {
    fetch_mock().mockResolvedValueOnce(
      Response.json(
        with_decimal_strings(min_amount, ["min_amount", "fiat_equivalent"])
      )
    );
    expect(await client.min_amount("eth")).toEqual({
      min: min_amount.min_amount,
      min_usd: min_amount.fiat_equivalent,
    });
  });

  it.each([
    ["no fiat_equivalent", { min_amount: 0.001 }],
    ["a zero fiat_equivalent", { min_amount: 0.001, fiat_equivalent: 0 }],
    ["a zero min_amount", { min_amount: 0, fiat_equivalent: 2 }],
    ["a non-numeric min_amount", { min_amount: "nope", fiat_equivalent: 2 }],
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

  it("min_amount returns both figures from the documented quote", async () => {
    fetch_mock().mockResolvedValueOnce(Response.json(min_amount));
    expect(await client.min_amount("eth")).toEqual({
      min: min_amount.min_amount,
      min_usd: min_amount.fiat_equivalent,
    });
  });

  it("min_amount quotes the token against the account's polygon usdc outcome, not against itself", async () => {
    const spy = fetch_mock().mockResolvedValueOnce(Response.json(min_amount));
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
    const spy = fetch_mock().mockResolvedValueOnce(Response.json(min_amount));
    await client.min_amount("ETH");

    expect(timeout).toHaveBeenCalledWith(10_000);
    const { signal } = requested(spy);
    expect(signal.aborted).toBe(false);
    ctl.abort();
    expect(signal.aborted).toBe(true);
  });
});
