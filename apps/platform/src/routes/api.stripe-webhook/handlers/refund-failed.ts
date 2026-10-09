import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import { is_reversed } from "@/donations";
import { msg } from "@/queue";
import { stage } from "$/env";
import { enqueue } from "$/kit/queue";
import { money } from "$/kit/stripe-money";
import { settled_donation } from "../helpers/settled-donation";

/**
 * a pending refund reverses its donation only once it succeeds, from the
 * webhook or the admin refund action alike, so a reversed donation here had
 * its refund fail after succeeding. undoing that reversal is finance's call,
 * so this only tells them.
 */
export async function handle_refund_failed(event: Stripe.RefundFailedEvent) {
  const refund = event.data.object;
  const don = await settled_donation(str_id(refund.payment_intent));
  const outcome = is_reversed(don.status)
    ? "the donation was reversed, and that reversal stands: the nonprofit is debited though the donor got nothing back."
    : `the donation was not reversed (status ${don.status}).`;

  // keyed on the event: a redelivery after a lost 200 collapses into this one
  await enqueue(
    msg("fiat-notice", {
      id: event.id,
      alert: {
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
      },
    })
  );
}
