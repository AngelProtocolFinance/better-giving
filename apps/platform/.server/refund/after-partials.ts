import type Stripe from "stripe";
import { report_error } from "#/errors/report";
import { is_reversed } from "@/donations";
import { msg } from "@/queue";
import { stage } from "../env";
import { enqueue } from "../kit/queue";
import { refund_list } from "../kit/stripe-money";
import { donation_get } from "../pg/queries/donation";
import type { RefundResult } from "./process";

export interface FullRefund {
  donation_id: string;
  /** where the full refund was seen, e.g. `charge ch_1, event evt_1` */
  seen_at: string;
  currency: string;
  /** the refund that refunded the rest of the charge */
  completing: Stripe.Refund;
  /** every other refund on the charge, failed ones included: each may have
   * sent a partial notice ops acted on */
  earlier: Stripe.Refund[];
  alert_from: string;
  dist_count: number;
}

/**
 * runs a full refund's `reverse`, which reverses every dist in full. with
 * earlier partial refunds on the charge ops have settled those by hand, so the
 * reversal is bracketed by notices telling them when to undo that adjustment.
 */
export async function reverse_after_partials(
  r: FullRefund,
  reverse: () => Promise<RefundResult>
): Promise<RefundResult> {
  if (r.earlier.length === 0) return reverse();

  const from = `${r.alert_from}-${stage}`;
  const detail = [
    `donation ${r.donation_id}, ${r.seen_at}`,
    `completing refund: ${refund_list([r.completing], r.currency)}`,
    `earlier partial refunds: ${refund_list(r.earlier, r.currency)}`,
  ];
  // queued before reversing, and awaited: a failed enqueue stops the run
  // before anything is reversed, so the retry gets to queue it again. keyed
  // on the completing refund, so an admin run and its webhook overlapping
  // send it once
  await enqueue(
    msg("fiat-notice", {
      id: `${r.completing.id}_start`,
      alert: {
        type: "NOTICE",
        from,
        title: "Full Refund After Partial: Reversal Starting",
        body: [
          ...detail,
          "Full refund received after earlier partial refund(s); automatic reversal is starting. Don't undo your hand adjustment until the reversal is confirmed.",
        ].join("\n"),
      },
    })
  );

  const result = await reverse();

  const failed = result.failures.length;
  // read from the donation, not this run's failures: an overlapping run may
  // have reversed the dists this one failed. a failed read falls back to this
  // run's own answer rather than losing the notice
  const reversed = await donation_get(r.donation_id).then(
    (don) => !!don && is_reversed(don.status),
    (err) => {
      report_error(err, { donation_id: r.donation_id });
      return failed === 0;
    }
  );
  const [title, lead] = reversed
    ? [
        "Reversal Complete: Undo Hand Adjustment",
        "Reversal complete: undo the hand adjustment for the earlier partial refunds, or they are debited twice.",
      ]
    : [
        "Reversal Did Not Complete: Keep Hand Adjustment",
        `Reversal did not complete: keep the hand adjustment. ${failed} of ${r.dist_count} dists failed to reverse, and the donation stays settled.`,
      ];
  const body = [lead, ...detail].join("\n");
  // queued, not sent: once reversed, a retry stops at the donation's status,
  // so only the queue's retries can land a failed send. a failed enqueue is
  // reported, instruction and all, rather than thrown: once reversed, no retry
  // gets far enough to queue it. keyed on the outcome: retries that fall short
  // collapse into one "keep", and the run that completes lands its "undo"
  await enqueue(
    msg("fiat-notice", {
      id: `${r.completing.id}_${reversed ? "undo" : "keep"}`,
      alert: { type: "NOTICE", from, title, body },
    })
  ).catch((err) =>
    report_error(err, { donation_id: r.donation_id, title, body })
  );

  return result;
}
