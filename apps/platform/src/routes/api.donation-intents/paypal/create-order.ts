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

export const create_order = async ({
  order_id,
  currency: c,
  npo_name,
  ...amount
}: IInput): Promise<string> => {
  const d = paypal_currencies[c];

  const base = rd(amount.base, d);
  const tip = rd(amount.tip, d);
  const fa = rd(amount.fee_allowance, d);
  const total = +base + +tip + +fa;

  const p: PurchaseUnitsRequest = {
    custom_id: order_id,
    amount: {
      value: rd(total, d),
      currency_code: c,
    },
  };

  if (tip || fa) {
    p.items ||= [];
    p.items.push({
      name: `Donation to ${npo_name}`,
      quantity: "1",
      unit_amount: {
        currency_code: c,
        value: rd(base, d),
      },
      category: "DONATION",
    });

    if (tip) {
      p.items.push({
        name: "Donation to Better Giving",
        quantity: "1",
        unit_amount: {
          currency_code: c,
          value: rd(tip, d),
        },
        category: "DONATION",
      });
    }
    if (fa) {
      p.items.push({
        name: "Fee coverage",
        quantity: "1",
        unit_amount: {
          currency_code: c,
          value: rd(fa, d),
        },
        category: "DONATION",
      });
    }

    if (p.amount) {
      p.amount.breakdown = {
        item_total: {
          currency_code: c,
          value: rd(total, d),
        },
      };
    }
  }
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
