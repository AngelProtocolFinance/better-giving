import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import { is_reversed } from "@/donations";
import { msg } from "@/queue";
import { stage } from "$/env";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { refund_list } from "$/kit/stripe-money";
import { earlier_partials, unsent_refunds } from "$/refund/after-partials";
import { reverse_charge } from "$/refund/reverse";
import { cancel_refunded_subscription } from "$/refund/subscription";
import { ReversalIncompleteError } from "./reversal-incomplete";
import { settled_donation } from "./settled-donation";

export interface RefundedCharge {
  charge: Stripe.Charge;
  intent_id: string;
  don: Awaited<ReturnType<typeof settled_donation>>;
  /** newest first */
  refunds: Stripe.Refund[];
  newest: Stripe.Refund;
}

/** `charge`'s donation and refunds as stripe has them now, or null when the
 * donation is already reversed. pass the charge freshly retrieved: events
 * arrive out of order, so a stale copy in one must not outvote what has
 * happened since */
export async function refunded_charge(
  charge: Stripe.Charge
): Promise<RefundedCharge | null> {
  const intent_id = str_id(charge.payment_intent);
  const don = await settled_donation(intent_id);
  if (is_reversed(don.status)) {
    console.info(`already refunded: ${don.id}`);
    return null;
  }

  const { data: refunds } = await stripe.refunds.list({
    charge: charge.id,
    limit: 100,
  });
  const [newest] = refunds;
  if (!newest) throw new Error(`no refund on charge: ${charge.id}`);
  return { charge, intent_id, don, refunds, newest };
}

/**
 * ends the gift's billing and reverses the donation of a charge refunded in
 * full, once every refund on it has succeeded. charge.refunded counts a refund
 * once made, not once sent: a bank refund (ach, acss) is pending for days and
 * can still fail, so the reversal waits for the refund.updated that sees the
 * last one succeed.
 */
export async function reverse_full_refund(
  { charge, intent_id, don, refunds, newest }: RefundedCharge,
  { seen_at, alert_from }: { seen_at: string; alert_from: string }
) {
  const don_id = don.id;

  const unsent = unsent_refunds(refunds);
  if (unsent.length > 0) {
    // the reversal ends the recurring gift itself; this ends it now, so a
    // pending refund can't bill again meanwhile
    await cancel_refunded_subscription(intent_id);
    console.info(
      `${alert_from}: reversal held on ${unsent.map((r) => r.id).join(", ")}: ${don_id}`
    );
    // awaited: a lost notice fails the delivery, so stripe redelivers it.
    // keyed on the completing refund, which stays the same while held
    await enqueue(
      msg("fiat-notice", {
        id: `${newest.id}_held`,
        alert: {
          type: "NOTICE",
          from: `${alert_from}-${stage}`,
          title: "Reversal Held: Refund Not Yet Succeeded",
          body: [
            `donation ${don_id}, ${seen_at}`,
            `completing refund: ${refund_list([newest], charge.currency)}`,
            `waiting on: ${refund_list(unsent, charge.currency)}`,
            "nothing is reversed until stripe reports every refund here succeeded (refund.updated), when the donation reverses automatically. if they show succeeded in stripe and the donation is still settled, check that the webhook endpoint subscribes to refund.updated.",
          ].join("\n"),
        },
      })
    );
    return;
  }

  // nothing can be refunded past a full refund, so the newest completed it.
  // the admin refund action reverses its own refund too: this is the backstop
  // for a run of it that left dists unreversed or never reached them
  const result = await reverse_charge({
    donation_id: don_id,
    rail: "stripe",
    source: "refund",
    alert_from,
    notice: { id: newest.id, lines: [`donation ${don_id}, ${seen_at}`] },
    after_partials: {
      seen_at,
      currency: charge.currency,
      completing: newest,
      earlier: earlier_partials(refunds, newest, charge.amount_captured),
    },
  });

  if (result.status === "already_reversed") {
    console.info(`already refunded: ${don_id}`);
  }
  if (result.status !== "failed") return;
  if (result.reason === "incomplete") {
    throw new ReversalIncompleteError(
      don_id,
      result.failures.length,
      result.dists
    );
  }
  throw new Error(`refund not reversed: ${don_id}: ${result.reason}`);
}
