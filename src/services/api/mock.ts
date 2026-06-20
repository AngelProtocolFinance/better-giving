import type { IToken } from "@better-giving/crypto";
import { HttpResponse, http } from "msw";
import { href } from "react-router";
import { getDotPath, safeParse } from "valibot";
import type { ITokenEstimate } from "#/types/api";
import type { Payment } from "#/types/crypto";
import type { ICurrenciesFv, ICurrencyFv } from "#/types/currency";
import type { IStripeIntentReturn } from "@/donations";
import { intent as intent_schema } from "@/donations/schema";

export const mock_usd: ICurrencyFv = { code: "USD", rate: 1, min: 1 };

export const mock_tokens: IToken[] = [
  {
    id: "1",
    code: "BTC",
    name: "Bitcoin",
    symbol: "BTC",
    precision: 8,
    logo: "/images/coins/btc.svg",
    network: "btc",
    color: "#f6931a",
    cg_id: "bitcoin",
  },
];

const don_intent_path = href("/api/donation-intents");
export const don_intents_error_handler = http.post(don_intent_path, () =>
  HttpResponse.error()
);

export const handlers = [
  // default: unauthenticated user
  http.get("/api/me", () => HttpResponse.json(null, { status: 401 })),
  // mock stripe intent creation — validates with real valibot schema
  http.post(don_intent_path, async (x) => {
    const body = await x.request.json();
    const parsed = safeParse(intent_schema, body);
    if (parsed.issues) {
      const i = parsed.issues[0];
      return new HttpResponse(`${getDotPath(i)}: ${i.message}`, {
        status: 400,
      });
    }
    const intent = parsed.output;

    if (intent.via === "card" || intent.via === "bank") {
      return HttpResponse.json({
        client_secret: "fake_intent_id",
        order_id: "fake_order_id",
      } satisfies IStripeIntentReturn);
    }
    if (intent.via === "crypto") {
      return HttpResponse.json({
        id: 123,
        address: "fake_address",
        amount: 1,
        usdpu: 1,
        description: "donation ",
        currency: "BTC",
        order_id: "fake_order_id",
      } satisfies Payment);
    }
  }),
  http.get(href("/api/tickers"), () => {
    return HttpResponse.json([
      { symbol: "AAPL", name: "Apple Inc.", amount: "", min: 0, usdpu: 1 },
    ]);
  }),
  http.get(href("/api/tokens"), () => {
    return HttpResponse.json([
      {
        id: "1",
        code: "BTC",
        symbol: "BTC",
        name: "Bitcoin",
        network: "btc",
        logo: "",
        color: "#f7931a",
        precision: 8,
        cg_id: "bitcoin",
        amount: "",
        min: 0,
        usdpu: 1,
      },
    ]);
  }),
  http.get(href("/api/tokens/:code/estimate", { code: ":code" }), () => {
    return HttpResponse.json({ min: 1, usdpu: 1 } satisfies ITokenEstimate);
  }),
  http.get(href("/api/tickers/:symbol/estimate", { symbol: ":symbol" }), () => {
    return HttpResponse.json({ min: 1, usdpu: 1 } satisfies ITokenEstimate);
  }),
  http.get(href("/api/currencies"), () => {
    const data: ICurrenciesFv = {
      all: [
        { code: "USD", rate: 1, min: 1 },
        { code: "EUR", rate: 0.92, min: 0.92 },
        { code: "GBP", rate: 0.79, min: 0.79 },
        { code: "CAD", rate: 1.37, min: 1.37 },
      ],
    };
    return HttpResponse.json(data);
  }),
  http.get(href("/api/top-countries"), () => {
    return HttpResponse.json([] satisfies string[]);
  }),
];
