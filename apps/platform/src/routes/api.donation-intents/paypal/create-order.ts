import type { PurchaseUnitsRequest } from "@better-giving/paypal";
import { paypal } from "$/kit/paypal";
import { fmt_minor, type ICharge } from "./charge";

interface IInput {
  order_id: string;
  currency: string;
  npo_name: string;
  charge: ICharge;
}

type Item = NonNullable<PurchaseUnitsRequest["items"]>[number];

export const create_order = async ({
  order_id,
  currency: c,
  npo_name,
  charge: { minor, total, scale },
}: IInput): Promise<string> => {
  const line = (name: string, minor: number): Item => ({
    name,
    quantity: "1",
    unit_amount: { currency_code: c, value: fmt_minor(minor, scale) },
    category: "DONATION",
  });

  const items = [line(`Donation to ${npo_name}`, minor.base)];
  if (minor.tip) items.push(line("Donation to Better Giving", minor.tip));
  if (minor.fee_allowance)
    items.push(line("Fee coverage", minor.fee_allowance));

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
