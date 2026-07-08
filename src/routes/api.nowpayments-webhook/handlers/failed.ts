import { donation_error as email } from "@better-giving/react-emails";
import type { NP } from "@/nowpayments/types";
import { send_email } from "$/email";
import { np } from "$/kit/nowpayments";
import { db } from "$/pg/db";
import { donation_get, donation_update } from "$/pg/queries/donation";

/**
 * reasons:
 *  - paid below minimum amount
 *  - ???
 */
export async function handle_failed(payment: NP.PaymentPayload) {
  const pay = await np.estimate(payment.pay_currency);
  const failure_reason =
    payment.actually_paid < pay.min
      ? `Paid amount: ${payment.actually_paid} ${payment.pay_currency} is less than the minimum processing amount: ${pay.min} ${payment.pay_currency}`
      : "Unknown error occurred";

  const order = await donation_get(payment.order_id);
  if (!order) {
    throw new Error(
      `notif recipient not found for failed payment:${payment.payment_id}`
    );
  }

  const x: email.IData = {
    recipient_name: order.to_name,
    donor_first_name: order.from_name?.split(" ")[0] ?? "Donor",
    error_message: failure_reason,
  };
  const { node, subject } = email.template(x);

  const res = await send_email({ node, subject, to: [order.from_email] });

  console.info("sent failure message", res.data?.id);

  /// DELETE INTENT IF APPLICABLE ///
  const outcome = await np.estimate(payment.outcome_currency);

  // denominated in outcome_currency
  const fees_usdc =
    payment.fee.serviceFee + payment.fee.depositFee + payment.fee.withdrawalFee;

  const fees_usd = fees_usdc * outcome.usdpu;

  const reprocessing_net = payment.actually_paid_at_fiat - 2 * fees_usd;
  if (reprocessing_net > 0) {
    throw new Error(
      `payment:${payment.payment_id} failed but can be reprocessed for an net of ${reprocessing_net}`
    );
  }

  return donation_update(db, payment.order_id, { status: "failed" });
}
