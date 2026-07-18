import { amnt_sum, partition } from "@/donations/helpers";
import type { NP } from "@/nowpayments/types";
import { np } from "$/kit/nowpayments";
import { db } from "$/pg/db";
import { donation_get, donation_update } from "$/pg/queries/donation";

export async function handle_confirming(
  payment: NP.PaymentPayload,
  stage: "staging" | "production" | "local"
) {
  const order = await donation_get(payment.order_id);

  if (!order) throw new Error(`Record ${payment.order_id} not found!`);
  /* ** EXTRACT TIP, FEE ALLOWANCE ** */

  const { usdpu } = await np.estimate(payment.pay_currency);

  const total = amnt_sum(order.amount);

  // in staging, use fake amount
  const paid = stage === "production" ? payment.actually_paid : total;

  // proportion tip and fees based on actual paid
  const parts = partition(order.amount);
  const actual = parts(paid);

  const updated = await donation_update(db, order.id, {
    status: "confirmed",
    amount: actual,
    currency: order.currency,
    upusd: 1 / usdpu,
  });
  return updated;
}
