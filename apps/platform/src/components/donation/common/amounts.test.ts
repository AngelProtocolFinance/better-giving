import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { from_stripe_amount } from "#/helpers/stripe";
import { payment_intent } from "#/routes/api.donation-intents/stripe/payment-intent";
import type { ICurrencyFv } from "#/types/currency";
import { PROCESSING_RATES } from "@/constants/common";
import type { TTipFormat } from "../types";
import { stripe_amounts } from "./amounts";
import { currency } from "./currency";
import { Summary } from "./summary";

const pi_create_mock = vi.hoisted(() =>
  vi.fn(async (_: { amount: number }) => ({ client_secret: "pi_secret" }))
);
vi.mock("$/kit/stripe", () => ({
  stripe: { paymentIntents: { create: pi_create_mock } },
}));

const cent_bases = [
  ...Array.from({ length: 200 }, (_, i) => i + 1),
  ...Array.from({ length: 150 }, (_, i) => (100 + i * 13) / 100),
];
// zero-decimal amounts are whole units, from the form's minimum up
const unit_bases = (min: number) =>
  Array.from({ length: 100 }, (_, i) => min + i * 13);

// usd/eur two-decimal; jpy zero-decimal; isk shown whole but charged in
// hundredths
const sweep: { c: ICurrencyFv; bases: number[] }[] = [
  { c: { code: "USD", rate: 1, min: 2 }, bases: cent_bases },
  { c: { code: "EUR", rate: 0.92, min: 2 }, bases: cent_bases },
  { c: { code: "JPY", rate: 150, min: 300 }, bases: unit_bases(300) },
  { c: { code: "ISK", rate: 140, min: 280 }, bases: unit_bases(280) },
];
const tip_formats: TTipFormat[] = ["none", "10", "15", "20"];

/** the figure in the summary's "Total charge" row, in the donor's currency */
const shown_total = (
  c: ICurrencyFv,
  parts: ReturnType<typeof stripe_amounts>
) => {
  const html = renderToStaticMarkup(
    createElement(Summary, {
      Amount: currency(c),
      on_back: () => {},
      amount: parts.base,
      fee_allowance: parts.fee_allowance,
      tip: parts.tip ? { value: parts.tip, charity_name: "npo" } : undefined,
    })
  );
  const dds = html.match(/<dd[^>]*>([^<]*)<\/dd>/g) ?? [];
  const last = dds.at(-1)?.replace(/<[^>]+>/g, "") ?? "";
  // "$12.34", "EUR 12.34 ($13.41)", "JPY 1,500 ($10.00)" — never the usd aside
  const figure = last.match(/^(?:\$|[A-Z]{3} )([\d,]+(?:\.\d+)?)/)?.[1];
  if (!figure) throw new Error(`no total in ${JSON.stringify(last)}`);
  return +figure.replace(/,/g, "");
};

/** what the card is charged: the amount the server's payment intent asks for */
const charged = async (
  c: ICurrencyFv,
  parts: ReturnType<typeof stripe_amounts>,
  bank_only: boolean
) => {
  pi_create_mock.mockClear();
  await payment_intent({
    ...parts,
    bank_only,
    currency: c.code,
    order_id: "o_1",
    customer_id: "cus_1",
  });
  const [params] = pi_create_mock.mock.calls[0];
  return from_stripe_amount(params.amount, c.code);
};

describe("stripe_amounts", () => {
  test("the summary total is what the card is charged, fee covered", async () => {
    const off: string[] = [];
    for (const { c, bases } of sweep) {
      for (const bank_only of [false, true]) {
        for (const tip_format of tip_formats) {
          for (const amount of bases) {
            const parts = stripe_amounts({
              amount,
              tip_format,
              tip: "",
              cover_processing_fee: true,
              currency: c,
              bank_only,
            });
            const shown = shown_total(c, parts);
            const charge = await charged(c, parts, bank_only);
            if (shown !== charge) {
              off.push(
                `${c.code} ${amount} tip ${tip_format}: ${shown}/${charge}`
              );
            }
          }
        }
      }
    }
    expect(off.slice(0, 5)).toEqual([]);
  });

  test("the covered fee still pays the card fee on the whole charge", () => {
    const short: string[] = [];
    for (const { c, bases } of sweep) {
      for (const amount of bases) {
        const parts = stripe_amounts({
          amount,
          tip_format: "15",
          tip: "",
          cover_processing_fee: true,
          currency: c,
        });
        const total = parts.base + parts.tip + parts.fee_allowance;
        const fee =
          total * PROCESSING_RATES.stripe +
          PROCESSING_RATES.stripe_flat * c.rate;
        if (fee > parts.fee_allowance + 1e-9) short.push(`${c.code} ${amount}`);
      }
    }
    expect(short).toEqual([]);
  });

  // $5 is 4.617 eur at 0.9234 and 736.85 jpy at 147.37
  test.each([
    { code: "USD", rate: 1, amount: 1_000, fee: 5 },
    { code: "EUR", rate: 0.9234, amount: 1_000, fee: 4.61 },
    { code: "JPY", rate: 147.37, amount: 1_000_000, fee: 736 },
  ])(
    "the covered bank fee stops at the 5 usd cap in $code's smallest unit",
    ({ code, rate, amount, fee }) => {
      const parts = stripe_amounts({
        amount,
        tip_format: "none",
        tip: "",
        cover_processing_fee: true,
        currency: { code, rate },
        bank_only: true,
      });
      expect(parts.fee_allowance).toBe(fee);
    }
  );
});
