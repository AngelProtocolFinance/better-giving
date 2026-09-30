import type Stripe from "stripe";
import { report_error } from "#/errors/report";
import { str_id } from "#/helpers/stripe";
import { is_reversed } from "@/donations";
import { msg } from "@/queue";
import { stage } from "$/env";
import { fiat_monitor } from "$/kit/discord";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { dists_for_refund } from "$/pg/queries/dist";
import { process_refund } from "$/refund/process";
import { money, refund_list } from "../helpers/money";
import { ReversalIncompleteError } from "../helpers/reversal-incomplete";
import { settled_donation } from "../helpers/settled-donation";

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
  // events arrive out of order: a stale partial copy must not outvote a charge
  // that has since been refunded in full
  const charge = await stripe.charges.retrieve(event.data.object.id);
  const intent_id = str_id(charge.payment_intent);
  const don = await settled_donation(intent_id);
  const don_id = don.id;
  if (is_reversed(don.status)) {
    console.info(`already refunded: ${don_id}`);
    return;
  }

  // newest first
  const { data: refunds } = await stripe.refunds.list({
    charge: charge.id,
    limit: 100,
  });
  const [newest, ...earlier] = refunds;
  if (!newest) throw new Error(`no refund on charge: ${charge.id}`);

  // process_refund reverses every dist in full; a partial reversal isn't
  // supported yet, so ops settles it by hand. the refund that completes the
  // charge reverses the donation as a full refund.
  if (!charge.refunded) {
    const added = added_by(event, refunds);
    await fiat_monitor.send_alert({
      type: "NOTICE",
      from: `${ALERT_FROM}-${stage}`,
      title: "Partial Refund Not Reversed",
      body: [
        `donation ${don_id}, charge ${charge.id}, event ${event.id}`,
        `new in this event: ${added ? refund_list(added, charge.currency) : "could not tell which refund is new"}`,
        `refunds on this charge: ${refund_list(refunds, charge.currency)}`,
        `total refunded so far: ${money(charge.amount_refunded, charge.currency)} of ${money(charge.amount, charge.currency)}`,
        "nothing was reversed automatically. if the rest is refunded later, the whole donation reverses automatically, so any hand adjustment made for these refunds must then be undone.",
      ].join("\n"),
    });
    return;
  }

  const graphs = await dists_for_refund(don_id);
  if (graphs.length === 0) {
    throw new Error(`no settled dists for donation: ${don_id}`);
  }

  // nothing can be refunded past a full refund, so the newest completed it.
  // every earlier refund, failed ones included: each may have sent a partial
  // notice ops acted on
  const detail = [
    `donation ${don_id}, charge ${charge.id}, event ${event.id}`,
    `completing refund: ${refund_list([newest], charge.currency)}`,
    `earlier partial refunds: ${refund_list(earlier, charge.currency)}`,
  ];
  // sent before reversing: once reversed, a redelivery short-circuits on the
  // donation status and a failed send is never retried
  if (earlier.length > 0) {
    await fiat_monitor.send_alert({
      type: "NOTICE",
      from: `${ALERT_FROM}-${stage}`,
      title: "Full Refund After Partial: Reversal Starting",
      body: [
        ...detail,
        "Full refund received after earlier partial refund(s); automatic reversal is starting. Don't undo your hand adjustment until the reversal is confirmed.",
      ].join("\n"),
    });
  }

  const result = await process_refund(don_id, graphs, {
    form_id: don.form_id ?? null,
    program_id: don.program?.id ?? null,
    alert_from: ALERT_FROM,
  });

  const failed = result.failures.length;
  if (earlier.length > 0) {
    const [title, lead] =
      failed === 0
        ? [
            "Reversal Complete: Undo Hand Adjustment",
            "Reversal complete: undo the hand adjustment for the earlier partial refunds, or they are debited twice.",
          ]
        : [
            "Reversal Did Not Complete: Keep Hand Adjustment",
            `Reversal did not complete: keep the hand adjustment. ${failed} of ${graphs.length} dists failed to reverse, and the donation stays settled.`,
          ];
    const body = [lead, ...detail].join("\n");
    // queued, not sent: once reversed, a redelivery stops at the donation's
    // status, so only the queue's retries can land a failed send. a failed
    // enqueue is reported, instruction and all, rather than failing the
    // delivery: once reversed, no redelivery gets far enough to queue it.
    // keyed on the outcome as well as the event: a redelivery failing alike
    // collapses into the "keep" notice, and one that now completes lands its
    // "undo" notice.
    await enqueue(
      msg("fiat-notice", {
        id: `${event.id}_${failed}`,
        alert: { type: "NOTICE", from: `${ALERT_FROM}-${stage}`, title, body },
      })
    ).catch((err) => report_error(err, { donation_id: don_id, title, body }));
  }

  console.info(
    `charge refunded: ${don_id}, dists: ${graphs.length}, failures: ${failed}, losses: ${result.loss_msgs.length}`
  );
  if (failed > 0) {
    throw new ReversalIncompleteError(don_id, failed, graphs.length);
  }
}
