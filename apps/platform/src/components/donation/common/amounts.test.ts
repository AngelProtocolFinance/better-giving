import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { from_stripe_amount, to_atomic_c } from "#/helpers/stripe";
import type { ICurrencyFv } from "#/types/currency";
import { PROCESSING_RATES } from "@/constants/common";
import type { TTipFormat } from "../types";
import { stripe_amounts } from "./amounts";
import { currency } from "./currency";
import { Summary } from "./summary";

const currencies: ICurrencyFv[] = [
  { code: "USD", rate: 1, min: 2 },
  { code: "EUR", rate: 0.92, min: 2 },
];
const tip_formats: TTipFormat[] = ["none", "10", "15", "20"];
const bases = [
  ...Array.from({ length: 200 }, (_, i) => i + 1),
  ...Array.from({ length: 150 }, (_, i) => (100 + i * 13) / 100),
];

/** the figure in the summary's "Total charge" row */
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
  const figure = last.match(/[\d,]+\.\d+/)?.[0] ?? "";
  return +figure.replace(/,/g, "");
};

describe("stripe_amounts", () => {
  test("the summary total is what the card is charged, fee covered", () => {
    const off: string[] = [];
    for (const c of currencies) {
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
            const charged = from_stripe_amount(
              to_atomic_c(c.code)(parts.base + parts.fee_allowance + parts.tip),
              c.code
            );
            const shown = shown_total(c, parts);
            if (shown !== charged) {
              off.push(
                `${c.code} ${amount} tip ${tip_format}: ${shown}/${charged}`
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
    for (const c of currencies) {
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
});
