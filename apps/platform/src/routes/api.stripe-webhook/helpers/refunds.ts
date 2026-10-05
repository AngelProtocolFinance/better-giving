import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import { is_reversed } from "@/donations";
import { msg } from "@/queue";
import { stage } from "$/env";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { money, refund_list } from "$/kit/stripe-money";
import { reverse_charge } from "$/refund/reverse";
import { is_failed_or_canceled, unsent_refunds } from "$/refund/unsent";
import { ReversalIncompleteError } from "./reversal-incomplete";
import { settled_donation } from "./settled-donation";

export interface RefundedCharge {
  charge: Stripe.Charge;
  intent_id: string;
  don: Awaited<ReturnType<typeof settled_donation>>;
  /** newest first */
  refunds: Stripe.Refund[];
  /** the newest refund that took or is taking money back */
  latest: Stripe.Refund;
}

/** `charge`'s donation and refunds as stripe has them now, or null when
 * nothing is left to act on: every refund failed or was canceled, or the
 * donation is already reversed. pass the charge freshly retrieved: events
 * arrive out of order, so a stale copy in one must not outvote what has
 * happened since */
export async function refunded_charge(
  charge: Stripe.Charge
): Promise<RefundedCharge | null> {
  if (charge.amount_refunded <= 0) return null;
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
  const latest = refunds.find((r) => !is_failed_or_canceled(r));
  if (!latest) throw new Error(`no live refund on charge: ${charge.id}`);
  return { charge, intent_id, don, refunds, latest };
}

/**
 * takes back the share of the donation its charge's refunds have taken so
 * far: the whole reverses it, less records what each party owes. charge.refunded
 * counts a refund once made, not once sent: a bank refund (ach, acss) is
 * pending for days and can still fail, so nothing is taken while one is,
 * until the refund.updated that sees the last one settle.
 */
export async function reverse_refunds(
  { charge, intent_id, don, refunds, latest }: RefundedCharge,
  o: {
    alert_from: string;
    /** where it was seen, e.g. `charge ch_1, event evt_1` */
    seen_at: string;
    /** the event: its notices' dedupe id */
    event_id: string;
    /** the event's own lines for ops, after the donation's */
    lines?: string[];
  }
) {
  const don_id = don.id;
  const unsent = unsent_refunds(refunds);
  const result = await reverse_charge({
    donation_id: don_id,
    rail: "stripe",
    source: "refund",
    share: { taken: charge.amount_refunded, of: charge.amount_captured },
    unsent_refunds: unsent.map((r) => r.id),
    intent_id,
    source_ref: latest.id,
    alert_from: o.alert_from,
    notice: {
      id: o.event_id,
      lines: [
        `donation ${don_id}, ${o.seen_at}`,
        ...(o.lines ?? []),
        `refunds on this charge: ${refund_list(refunds, charge.currency)}`,
        `total refunded so far: ${money(charge.amount_refunded, charge.currency)} of ${money(charge.amount_captured, charge.currency)}`,
      ],
    },
  });

  switch (result.status) {
    case "held":
      // awaited: a lost notice fails the delivery, so stripe redelivers it.
      // keyed on the newest refund, which stays the same while held
      await enqueue(
        msg("fiat-notice", {
          id: `${latest.id}_held`,
          alert: {
            type: "NOTICE",
            from: `${o.alert_from}-${stage}`,
            title: "Reversal Held: Refund Not Yet Succeeded",
            body: [
              `donation ${don_id}, ${o.seen_at}`,
              `latest refund: ${refund_list([latest], charge.currency)}`,
              `waiting on: ${refund_list(unsent, charge.currency)}`,
              "nothing is reversed or recorded as owed until stripe reports every refund here settled (refund.updated), when the refunded share is taken back automatically. if they show succeeded in stripe and nothing was taken back, check that the webhook endpoint subscribes to refund.updated.",
            ].join("\n"),
          },
        })
      );
      return;
    case "already_reversed":
      console.info(`already refunded: ${don_id}`);
      return;
    case "failed":
      if (result.reason === "incomplete") {
        throw new ReversalIncompleteError(
          don_id,
          result.failures.length,
          result.dists
        );
      }
      throw new Error(`refund not reversed: ${don_id}: ${result.reason}`);
  }
}
