import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import { stripe } from "$/kit/stripe";
import { refunded_charge, reverse_full_refund } from "../helpers/full-refund";

const ALERT_FROM = "refund-updated";

/**
 * reverses the donation that charge.refunded left for a pending refund, once
 * that refund succeeds. a failed or canceled one reverses nothing: refund.failed
 * tells ops.
 */
export async function handle_refund_updated(event: Stripe.RefundUpdatedEvent) {
  const refund = event.data.object;
  // judged on the charge as stripe has it now: the event's copy can be stale
  const charge = await stripe.charges.retrieve(str_id(refund.charge));
  if (!charge.refunded) return;
  const refunded = await refunded_charge(charge);
  if (!refunded) return;

  await reverse_full_refund(refunded, {
    seen_at: `refund ${refund.id}, event ${event.id}`,
    alert_from: ALERT_FROM,
  });
}
