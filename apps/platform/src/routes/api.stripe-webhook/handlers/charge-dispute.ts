import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import { msg } from "@/queue";
import { stage } from "$/env";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { money, refund_list } from "$/kit/stripe-money";
import { type Money, reverse_charge } from "$/refund/reverse";
import { ReversalIncompleteError } from "../helpers/reversal-incomplete";
import { settled_donation } from "../helpers/settled-donation";

const ALERT_FROM = "charge-dispute";

const dispute_line = (d: Stripe.Dispute, don_id: string, event_id: string) =>
  `donation ${don_id}, dispute ${d.id}, charge ${str_id(d.charge)}, event ${event_id}`;

/** in its balance transactions' own (settlement) currency, never the dispute's */
const fee_txns = (d: Stripe.Dispute) =>
  d.balance_transactions.filter((bt) => bt.fee !== 0);

const dispute_fees = (d: Stripe.Dispute) =>
  fee_txns(d)
    .map((bt) => `${money(bt.fee, bt.currency)} (${bt.id})`)
    .join(", ") || "none recorded";

/** a dispute's balance transactions all settle in the charge's settlement
 * currency, so their fees sum */
const dispute_fee = (d: Stripe.Dispute): { dispute_fee?: Money } => {
  const [first, ...rest] = fee_txns(d);
  if (!first) return {};
  const amount = rest.reduce((sum, bt) => sum + bt.fee, first.fee);
  return { dispute_fee: { amount, currency: first.currency } };
};

export async function handle_dispute_closed(
  event: Stripe.ChargeDisputeClosedEvent
) {
  const dispute = event.data.object;
  if (dispute.status !== "lost") {
    console.info(`dispute ${dispute.id} closed ${dispute.status}: kept`);
    return;
  }
  const don = await settled_donation(str_id(dispute.payment_intent));

  // dispute.amount can be part of the charge: the gift reverses only once the
  // dispute and earlier refunds leave nothing on it
  const charge = await stripe.charges.retrieve(str_id(dispute.charge));
  const { data: refunds } = await stripe.refunds.list({
    charge: charge.id,
    limit: 100,
  });
  const taken = dispute.amount + charge.amount_refunded;
  const partial = taken < charge.amount;

  const result = await reverse_charge({
    donation_id: don.id,
    rail: "stripe",
    source: "dispute",
    ...(partial ? { amount: dispute.amount } : {}),
    ...dispute_fee(dispute),
    alert_from: ALERT_FROM,
    notice: {
      id: event.id,
      lines: [
        dispute_line(dispute, don.id, event.id),
        `disputed amount: ${money(dispute.amount, dispute.currency)}, reason: ${dispute.reason}`,
        `earlier refunds: ${refund_list(refunds, charge.currency) || "none"}`,
        ...(partial
          ? [
              `taken back so far: ${money(taken, charge.currency)} of ${money(charge.amount, charge.currency)}`,
            ]
          : []),
        `dispute fee: ${dispute_fees(dispute)}`,
      ],
    },
  });

  if (result.status === "already_reversed") {
    console.info(`already reversed: ${don.id}`);
  }
  if (result.status !== "failed") return;
  if (result.reason === "incomplete") {
    throw new ReversalIncompleteError(
      don.id,
      result.failures.length,
      result.dists
    );
  }
  throw new Error(`dispute ${dispute.id} not reversed: ${result.reason}`);
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
