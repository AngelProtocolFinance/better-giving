import create_invoice from "./create-invoice.json";
import create_payment from "./create-payment.json";
import estimate_price from "./get-estimated-price.json";
import min_amount from "./get-min-amount.json";

/**
 * Published NOWPayments response examples, copied verbatim into the JSON
 * files next to this module. JSON has no comment syntax, so the source of
 * each file is named here.
 *
 * Collection: https://documenter.getpostman.com/view/7907941/2s93JusNJt
 *
 * - `estimate_price` — Payments → Get estimated price, 200
 * - `min_amount` — Payments → Get the minimum payment amount, 200
 * - `create_invoice` — Payments → Create invoice, 201
 * - `create_payment` — Payments → Create payment, 201. The collection uses
 *   the same body for Create payment by invoice.
 */
export { create_invoice, create_payment, estimate_price, min_amount };

/**
 * the published examples quote these amounts as JSON numbers. the live API
 * quotes the same fields as decimal strings (`"3999.5"`, `"0.17061637"`).
 */
export const with_decimal_strings = <T extends object>(
  body: T,
  keys: (keyof T)[]
): T => {
  const out: T = { ...body };
  for (const key of keys) {
    const value = out[key];
    if (typeof value === "number") out[key] = String(value) as T[keyof T];
  }
  return out;
};
