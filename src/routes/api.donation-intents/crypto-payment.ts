import type { Payment } from "#/types/crypto";
import { stage } from "$/env";
import { np } from "$/kit/nowpayments";

export interface Order {
  id: string;
  description: string;
  amount: number;
  usdpu: number;
  currency: string;
}
export async function crypto_payment(
  order: Order,
  webhook_url: string
): Promise<Payment> {
  const invoice = await np.invoice({
    price_amount: order.amount * order.usdpu,
    price_currency: "usd",
    pay_currency: order.currency,
    ipn_callback_url: webhook_url,
    order_id: order.id,
    order_description: order.description,
  });

  const p = await np.payment_invoice({
    iid: invoice.id,
    pay_currency: order.currency,
    order_description: order.description,
    // nowpayments only simulates in test
    case: stage === "production" ? undefined : "success",
  });

  return {
    id: p.payment_id,
    order_id: order.id,
    address: p.pay_address,
    extra_address: p.payin_extra_id ?? undefined,
    amount: p.pay_amount,
    currency: p.pay_currency,
    description: order.description,
    usdpu: order.usdpu,
  };
}
