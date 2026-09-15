import { donation_error as email } from "emails";
import { report_error } from "#/errors/report";
import type { IDonation } from "@/donations";
import type { NP } from "@/nowpayments/types";
import { send_email } from "$/email";
import { np } from "$/kit/nowpayments";
import { alert, alert_all } from "./alert";
import { fee_usd, ref_of } from "./payment";
import { settle_rates } from "./rates";
import type { Action } from "./status";
import { write_on } from "./write";

/**
 * reasons:
 *  - paid below minimum amount
 *  - ???
 *
 * the donor is emailed once, only by the delivery whose locked write moved the
 * row to `failed`.
 */
export async function handle_failed(
  payment: NP.PaymentPayload,
  order: IDonation
): Promise<Action> {
  const rates = await settle_rates(payment);
  const fee = fee_usd(payment, rates.fee_usdpu);
  await alert_all(fee.warnings);

  // ops reprocesses it, so the donor is not told it failed and the row stays
  // open for the `finished` that follows
  const reprocessing_net = payment.actually_paid_at_fiat - 2 * fee.value;
  if (reprocessing_net > 0) {
    await alert({
      title: "Failed payment can be reprocessed",
      body: `${ref_of(payment)} net:${reprocessing_net}`,
    });
    return { op: "ignore", why: "reprocessable" };
  }

  // before the write: a throw after it would redeliver onto a `failed` row,
  // which never emails
  const pay = await np.min_amount(payment.pay_currency);
  const failure_reason =
    payment.actually_paid < pay.min
      ? `Paid amount: ${payment.actually_paid} ${payment.pay_currency} is less than the minimum processing amount: ${pay.min} ${payment.pay_currency}`
      : "Unknown error occurred";

  const now = await write_on(order.id, payment, { repeat: false }, "fail", {
    status: "failed",
  });
  if (now.op !== "fail") return now;

  const x: email.IData = {
    recipient_name: order.to_name,
    donor_first_name: order.from_name?.split(" ")[0] ?? "Donor",
    error_message: failure_reason,
  };
  const { node, subject } = email.template(x);

  // after the write, for the same reason: a send failure is reported rather
  // than retried
  await send_email({ node, subject, to: [order.from_email] })
    .then((res) => console.info("sent failure message", res.data?.id))
    .catch((err) =>
      report_error(err, { payment_id: payment.payment_id, order_id: order.id })
    );

  return now;
}
