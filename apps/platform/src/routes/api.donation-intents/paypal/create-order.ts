import type { PurchaseUnitsRequest } from "@better-giving/paypal";
import { paypal_currencies } from "#/constants/paypal";
import type { IAmount } from "@/donations";
import { rd } from "@/helpers/decimal";
import { paypal } from "$/kit/paypal";

interface IInput extends IAmount {
  order_id: string;
  currency: string;
  npo_name: string;
}

type Item = NonNullable<PurchaseUnitsRequest["items"]>[number];

/** a line truncated to the currency's scale, in integer minor units */
const to_minor = (amount: number, d: number): number =>
  Number(rd(amount, d).replace(".", ""));

const fmt_minor = (minor: number, d: number): string => {
  if (d === 0) return `${minor}`;
  const digits = `${minor}`.padStart(d + 1, "0");
  return `${digits.slice(0, -d)}.${digits.slice(-d)}`;
};

export const create_order = async ({
  order_id,
  currency: c,
  npo_name,
  ...amount
}: IInput): Promise<string> => {
  // unlisted currency: 2 decimals keeps the amount well-formed for paypal to accept or refuse
  const d = paypal_currencies[c] ?? 2;

  const base = to_minor(amount.base, d);
  const tip = to_minor(amount.tip, d);
  const fa = to_minor(amount.fee_allowance, d);
  // summed from the same truncated lines the items carry, so paypal's item_total == Σ items holds by construction
  const total = fmt_minor(base + tip + fa, d);

  const line = (name: string, minor: number): Item => ({
    name,
    quantity: "1",
    unit_amount: { currency_code: c, value: fmt_minor(minor, d) },
    category: "DONATION",
  });

  const items = [line(`Donation to ${npo_name}`, base)];
  if (tip) items.push(line("Donation to Better Giving", tip));
  if (fa) items.push(line("Fee coverage", fa));

  const p: PurchaseUnitsRequest = {
    custom_id: order_id,
    amount: {
      value: total,
      currency_code: c,
      breakdown: { item_total: { currency_code: c, value: total } },
    },
    items,
  };

  // order_id is stable per intent — use it as the idempotency key so a retry
  // after a timeout returns the original order instead of a duplicate
  const { id = "invalid id" } = await paypal.create_order(
    {
      intent: "CAPTURE",
      purchase_units: [p],
    },
    `order-${order_id}`
  );

  return id;
};
