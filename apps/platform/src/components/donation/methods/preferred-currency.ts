import { currency_precision } from "#/helpers/stripe";
import type { ICurrencyFv } from "#/types/currency";
import { ru } from "@/helpers/decimal";

/**
 * a preferred currency may replace the opening dollars, and an untouched
 * dollar amount moves with it. an amount the donor already typed, or a
 * currency already on the form, is denominated in what the field shows —
 * multiplying it reads that number as dollars.
 *
 * nothing back means leave the field alone.
 */
export function preferred_currency_apply(
  current: ICurrencyFv,
  amount: string,
  seed_amount: string,
  pref: ICurrencyFv
): { currency: ICurrencyFv; amount: string } | undefined {
  if (current.code.toUpperCase() !== "USD" || amount !== seed_amount) return;
  const converted = amount ? +amount * pref.rate : 0;
  return {
    currency: pref,
    amount: converted ? ru(converted, currency_precision(pref.code)) : "",
  };
}
