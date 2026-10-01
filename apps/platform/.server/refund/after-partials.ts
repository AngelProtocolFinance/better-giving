import type Stripe from "stripe";
import { report_error } from "#/errors/report";
import { msg } from "@/queue";
import { stage } from "../env";
import { fiat_monitor } from "../kit/discord";
import { enqueue } from "../kit/queue";
import { refund_list } from "../kit/stripe-money";
import type { RefundResult } from "./process";

export interface FullRefund {
  donation_id: string;
  /** where the full refund was seen, e.g. `charge ch_1, event evt_1` */
  seen_at: string;
  /** keys the outcome notice's dedupe; one per full refund and its retries */
  notice_id: string;
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
  // sent before reversing: once reversed, a retry short-circuits on the
  // donation status and a failed send is never retried
  await fiat_monitor.send_alert({
    type: "NOTICE",
    from,
    title: "Full Refund After Partial: Reversal Starting",
    body: [
      ...detail,
      "Full refund received after earlier partial refund(s); automatic reversal is starting. Don't undo your hand adjustment until the reversal is confirmed.",
    ].join("\n"),
  });

  const result = await reverse();

  const failed = result.failures.length;
  const [title, lead] =
    failed === 0
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
  // gets far enough to queue it. keyed on the outcome as well: a retry failing
  // alike collapses into the "keep" notice, and one that now completes lands
  // its "undo" notice.
  await enqueue(
    msg("fiat-notice", {
      id: `${r.notice_id}_${failed}`,
      alert: { type: "NOTICE", from, title, body },
    })
  ).catch((err) =>
    report_error(err, { donation_id: r.donation_id, title, body })
  );

  return result;
}
