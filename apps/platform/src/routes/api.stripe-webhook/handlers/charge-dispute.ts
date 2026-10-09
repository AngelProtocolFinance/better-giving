import type Stripe from "stripe";
import { report_error } from "#/errors/report";
import { str_id } from "#/helpers/stripe";
import { is_reversed } from "@/donations";
import { msg } from "@/queue";
import { stage } from "$/env";
import { fiat_monitor } from "$/kit/discord";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { money, refund_list } from "$/kit/stripe-money";
import { dists_for_refund } from "$/pg/queries/dist";
import { process_refund } from "$/refund/process";
import { ReversalIncompleteError } from "../helpers/reversal-incomplete";
import { settled_donation } from "../helpers/settled-donation";

const ALERT_FROM = "charge-dispute";

const dispute_line = (d: Stripe.Dispute, don_id: string, event_id: string) =>
  `donation ${don_id}, dispute ${d.id}, charge ${str_id(d.charge)}, event ${event_id}`;

/** each in its balance transaction's own (settlement) currency, never the dispute's */
const dispute_fees = (d: Stripe.Dispute) =>
  d.balance_transactions
    .filter((bt) => bt.fee !== 0)
    .map((bt) => `${money(bt.fee, bt.currency)} (${bt.id})`)
    .join(", ") || "none recorded";

export async function handle_dispute_closed(
  event: Stripe.ChargeDisputeClosedEvent
) {
  const dispute = event.data.object;
  if (dispute.status !== "lost") {
    console.info(`dispute ${dispute.id} closed ${dispute.status}: kept`);
    return;
  }
  const don = await settled_donation(str_id(dispute.payment_intent));
  if (is_reversed(don.status)) {
    console.info(`already reversed: ${don.id}`);
    return;
  }

  // dispute.amount can be part of the charge. process_refund reverses every
  // dist in full, so it runs only once the dispute and earlier refunds leave
  // nothing on the charge
  const charge = await stripe.charges.retrieve(str_id(dispute.charge));
  const { data: refunds } = await stripe.refunds.list({
    charge: charge.id,
    limit: 100,
  });
  const earlier = `earlier refunds: ${refund_list(refunds, charge.currency) || "none"}`;
  const taken = dispute.amount + charge.amount_refunded;
  if (taken < charge.amount) {
    await fiat_monitor.send_alert({
      type: "NOTICE",
      from: `${ALERT_FROM}-${stage}`,
      title: "Lost Dispute Not Reversed",
      body: [
        dispute_line(dispute, don.id, event.id),
        `disputed: ${money(dispute.amount, dispute.currency)}, reason: ${dispute.reason}`,
        earlier,
        `taken back so far: ${money(taken, charge.currency)} of ${money(charge.amount, charge.currency)}`,
        `dispute fee: ${dispute_fees(dispute)}`,
        "nothing was reversed automatically: settle this donation by hand.",
      ].join("\n"),
    });
    return;
  }

  const graphs = await dists_for_refund(don.id);
  if (graphs.length === 0) {
    throw new Error(`no settled dists for donation: ${don.id}`);
  }
  const result = await process_refund(don.id, graphs, {
    form_id: don.form_id ?? null,
    program_id: don.program?.id ?? null,
    alert_from: ALERT_FROM,
  });

  const failed = result.failures.length;
  const title =
    failed === 0
      ? "Dispute Lost: Donation Reversed"
      : "Dispute Lost: Reversal Did Not Complete";
  const body = [
    dispute_line(dispute, don.id, event.id),
    `disputed amount: ${money(dispute.amount, dispute.currency)}, reason: ${dispute.reason}`,
    earlier,
    `dispute fee: ${dispute_fees(dispute)}`,
    failed === 0
      ? `all ${graphs.length} dists reversed.`
      : `${failed} of ${graphs.length} dists failed to reverse, and the donation stays settled.`,
    ...result.loss_msgs.map((m) => `loss: ${m}`),
  ].join("\n");
  // queued, not sent: once reversed, a redelivery stops at the donation's
  // status, so only the queue's retries can land a failed send. keyed on the
  // outcome, so a redelivery failing alike collapses into this notice
  await enqueue(
    msg("fiat-notice", {
      id: `${event.id}_${failed}`,
      alert: { type: "NOTICE", from: `${ALERT_FROM}-${stage}`, title, body },
    })
  ).catch((err) => report_error(err, { donation_id: don.id, title, body }));
  if (failed > 0) {
    throw new ReversalIncompleteError(don.id, failed, graphs.length);
  }
}

export async function handle_dispute_created(
  event: Stripe.ChargeDisputeCreatedEvent
) {
  const dispute = event.data.object;
  const don = await settled_donation(str_id(dispute.payment_intent));
  const due = dispute.evidence_details?.due_by;

  // keyed on the event: a redelivery after a lost 200 collapses into this one
  await enqueue(
    msg("fiat-notice", {
      id: event.id,
      alert: {
        type: "NOTICE",
        from: `${ALERT_FROM}-${stage}`,
        title: "Stripe Dispute Opened",
        body: [
          dispute_line(dispute, don.id, event.id),
          `amount: ${money(dispute.amount, dispute.currency)}, reason: ${dispute.reason}, status: ${dispute.status}`,
          `evidence due by: ${due ? new Date(due * 1000).toISOString() : "n/a"}`,
          "the donation stays settled while the dispute is open. if it is lost and nothing is left on the charge, the donation reverses automatically; a partial loss is left to you.",
        ].join("\n"),
      },
    })
  );
}
