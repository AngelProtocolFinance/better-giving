import type Stripe from "stripe";
import { stripe } from "$/kit/stripe";
import { money, refund_list } from "$/kit/stripe-money";
import { reverse_charge } from "$/refund/reverse";
import { refunded_charge, reverse_full_refund } from "../helpers/full-refund";

const ALERT_FROM = "charge-refunded";

/** the refunds this event added, oldest first, or null when the event can't
 * say. charge.refunded names no refund, so they're found by where the event's
 * amount refunded before and after it falls in the refund list, or failing
 * that, as the latest refund by the event's time */
const added_by = (
  { created, data }: Stripe.ChargeRefundedEvent,
  refunds: Stripe.Refund[]
) => {
  // a refund made after this event isn't in it, so a redelivery marks the same ones
  const by_then = refunds.filter((r) => r.created <= created);
  // stripe documents previous_attributes for *.updated events only
  const before = data.previous_attributes?.amount_refunded;
  if (before === undefined) {
    const [latest, next] = by_then; // newest first
    const tied = latest && next && latest.created === next.created;
    return latest && !tied ? [latest] : null;
  }
  const oldest_first = by_then.reverse();
  let prior = 0;
  let i = 0;
  for (; i < oldest_first.length && prior < before; i++) {
    prior += oldest_first[i]?.amount ?? 0;
  }
  const added = oldest_first.slice(i);
  const total = added.reduce((sum, r) => sum + r.amount, prior);
  // a list that no longer adds up to the event's amounts (a refund failed
  // since) can't say which is new
  const reconciles = prior === before && total === data.object.amount_refunded;
  return reconciles && added.length > 0 ? added : null;
};

export async function handle_charge_refunded(
  event: Stripe.ChargeRefundedEvent
) {
  // a stale partial copy must not outvote a charge since refunded in full
  const refunded = await refunded_charge(
    await stripe.charges.retrieve(event.data.object.id)
  );
  if (!refunded) return;
  const { charge, don, refunds } = refunded;
  const don_id = don.id;

  // a partial reverses nothing and ops settles it by hand. the refund that
  // completes the charge reverses the donation as a full refund.
  if (!charge.refunded) {
    const added = added_by(event, refunds);
    const result = await reverse_charge({
      donation_id: don_id,
      rail: "stripe",
      source: "refund",
      amount: charge.amount_refunded,
      alert_from: ALERT_FROM,
      notice: {
        id: event.id,
        lines: [
          `donation ${don_id}, charge ${charge.id}, event ${event.id}`,
          `new in this event: ${added ? refund_list(added, charge.currency) : "could not tell which refund is new"}`,
          `refunds on this charge: ${refund_list(refunds, charge.currency)}`,
          `total refunded so far: ${money(charge.amount_refunded, charge.currency)} of ${money(charge.amount, charge.currency)}`,
        ],
      },
    });
    if (result.status === "failed") {
      throw new Error(`partial refund not noted: ${don_id}: ${result.reason}`);
    }
    return;
  }

  await reverse_full_refund(refunded, {
    seen_at: `charge ${charge.id}, event ${event.id}`,
    alert_from: ALERT_FROM,
  });
}
