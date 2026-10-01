import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import { is_reversed } from "@/donations";
import { msg } from "@/queue";
import { stage } from "$/env";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { refund_list } from "$/kit/stripe-money";
import { dists_for_refund } from "$/pg/queries/dist";
import {
  earlier_partials,
  reverse_after_partials,
} from "$/refund/after-partials";
import { process_refund } from "$/refund/process";
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
 * full, once the refund that completed it has succeeded. charge.refunded
 * counts a refund once made, not once sent: a bank refund (ach, acss) is
 * pending for days and can still fail, so its reversal waits for the
 * refund.updated that sees it succeed.
 */
export async function reverse_full_refund(
  { charge, intent_id, don, refunds, newest }: RefundedCharge,
  { seen_at, alert_from }: { seen_at: string; alert_from: string }
) {
  const don_id = don.id;

  // product rule: a full refund of a subscription payment ends the recurring
  // gift, from whatever surface it was issued. not held with the reversal, so
  // a pending one can't bill again meanwhile
  await cancel_refunded_subscription(intent_id);

  if (newest.status !== "succeeded") {
    console.info(
      `${alert_from}: reversal held, refund ${newest.id} ${newest.status}: ${don_id}`
    );
    // awaited: a lost notice fails the delivery, so stripe redelivers it
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
            "nothing is reversed until stripe reports this refund succeeded (refund.updated), when the donation reverses automatically. if the refund shows succeeded in stripe and the donation is still settled, check that the webhook endpoint subscribes to refund.updated.",
          ].join("\n"),
        },
      })
    );
    return;
  }

  const graphs = await dists_for_refund(don_id);
  if (graphs.length === 0) {
    throw new Error(`no settled dists for donation: ${don_id}`);
  }

  // nothing can be refunded past a full refund, so the newest completed it.
  // the admin refund action reverses its own refund too: this is the backstop
  // for a run of it that left dists unreversed or never reached them
  const result = await reverse_after_partials(
    {
      donation_id: don_id,
      seen_at,
      currency: charge.currency,
      completing: newest,
      earlier: earlier_partials(refunds, newest, charge.amount_captured),
      alert_from,
      dist_count: graphs.length,
    },
    () =>
      process_refund(don_id, graphs, {
        form_id: don.form_id ?? null,
        program_id: don.program?.id ?? null,
        alert_from,
      })
  );

  const failed = result.failures.length;
  console.info(
    `${alert_from}: reversed ${don_id}, dists: ${graphs.length}, failures: ${failed}, losses: ${result.loss_msgs.length}`
  );
  if (failed > 0) {
    throw new ReversalIncompleteError(don_id, failed, graphs.length);
  }
}
