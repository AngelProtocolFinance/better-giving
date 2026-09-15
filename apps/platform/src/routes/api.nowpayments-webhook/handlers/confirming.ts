import type { IDonation } from "@/donations";
import type { NP } from "@/nowpayments/types";
import { nowpayments } from "$/env";
import { np } from "$/kit/nowpayments";
import { paid_amount } from "./payment";
import type { Action } from "./status";
import { write_on } from "./write";

export async function handle_confirming(
  payment: NP.PaymentPayload,
  order: IDonation
): Promise<Action> {
  const { usdpu } = await np.estimate(payment.pay_currency);

  return write_on(order.id, payment, { repeat: false }, "confirm", {
    status: "confirmed",
    amount: paid_amount(payment, order, nowpayments.is_sandbox),
    currency: order.currency,
    upusd: 1 / usdpu,
  });
}
