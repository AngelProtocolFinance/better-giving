import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import { is_reversed } from "@/donations";
import { stage } from "$/env";
import { fiat_monitor } from "$/kit/discord";
import { money } from "../helpers/money";
import { settled_donation } from "../helpers/settled-donation";

/**
 * a bank refund (ach, acss) can fail days after charge.refunded reversed the
 * donation. undoing that reversal is finance's call, so this only tells them.
 */
export async function handle_refund_failed(event: Stripe.RefundFailedEvent) {
  const refund = event.data.object;
  const don = await settled_donation(str_id(refund.payment_intent));
  const outcome = is_reversed(don.status)
    ? "the donation was reversed when this refund was made, and that reversal stands: the nonprofit is debited though the donor got nothing back."
    : `the donation was not reversed (status ${don.status}).`;

  await fiat_monitor.send_alert({
    type: "ERROR",
    from: `refund-failed-${stage}`,
    title: "Stripe Refund Failed",
    body: [
      `donation ${don.id}, refund ${refund.id}, event ${event.id}`,
      `amount: ${money(refund.amount, refund.currency)}`,
      `failure reason: ${refund.failure_reason ?? "unknown"}`,
      outcome,
      "nothing was changed automatically.",
    ].join("\n"),
  });
}
