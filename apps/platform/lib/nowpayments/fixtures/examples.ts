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
 * listed keys come back as `string`. the published examples quote these
 * amounts as JSON numbers; the live API quotes the same fields as decimal
 * strings (`"3999.5"`, `"0.17061637"`).
 */
type WithDecimalStrings<T, K extends keyof T> = {
  [P in keyof T]: P extends K ? (T[P] extends number ? string : T[P]) : T[P];
};

export const with_decimal_strings = <T extends object, const K extends keyof T>(
  body: T,
  keys: readonly K[]
): WithDecimalStrings<T, K> => {
  const out: { [P in keyof T]: T[P] | string } = { ...body };
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "number") Object.assign(out, { [key]: String(value) });
  }
  return out as WithDecimalStrings<T, K>;
};
