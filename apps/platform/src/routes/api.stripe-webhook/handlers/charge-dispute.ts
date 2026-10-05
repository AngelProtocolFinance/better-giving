import type Stripe from "stripe";
import { from_stripe_amount, str_id } from "#/helpers/stripe";
import { msg } from "@/queue";
import { stage } from "$/env";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { money, refund_list } from "$/kit/stripe-money";
import { db } from "$/pg/db";
import {
  dispute_close,
  dispute_open,
  disputes_of_donation,
} from "$/pg/queries/dispute";
import type { IOwed } from "$/pg/queries/owed";
import { dispute_opened, dispute_won } from "$/refund/dispute";
import { load_reversible, type Money, reverse_charge } from "$/refund/reverse";
import { ReversalIncompleteError } from "../helpers/reversal-incomplete";
import { settled_donation } from "../helpers/settled-donation";

const ALERT_FROM = "charge-dispute";

const iso = (unix: number) => new Date(unix * 1000).toISOString();

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

/** dispute.amount can be part of the charge: the gift reverses only once the
 * dispute and earlier refunds leave nothing on it */
async function taken_from_charge(d: Stripe.Dispute) {
  const charge = await stripe.charges.retrieve(str_id(d.charge));
  const taken = d.amount + charge.amount_refunded;
  return { charge, taken, partial: taken < charge.amount };
}

export async function handle_dispute_closed(
  event: Stripe.ChargeDisputeClosedEvent
) {
  const dispute = event.data.object;
  if (dispute.status !== "lost" && dispute.status !== "won") {
    console.info(`dispute ${dispute.id} closed ${dispute.status}: kept`);
    return;
  }
  const don = await settled_donation(str_id(dispute.payment_intent));
  const at = { opened_at: iso(dispute.created), closed_at: iso(event.created) };

  if (dispute.status === "won") {
    const won = await dispute_won({
      donation_id: don.id,
      rail: "stripe",
      dispute_id: dispute.id,
      ...at,
    });
    if (won.status === "failed") {
      throw new Error(`dispute ${dispute.id} not credited: ${won.reason}`);
    }
    return;
  }

  await dispute_close(db, {
    id: dispute.id,
    donation_id: don.id,
    status: "lost",
    ...at,
  });
  // ahead of the stripe calls: a hiccup there must not turn an ack into retries
  const loaded = await load_reversible(don.id, "stripe");
  if (loaded.status === "already_reversed") {
    console.info(`already reversed: ${don.id}`);
    return;
  }

  const { charge, taken, partial } = await taken_from_charge(dispute);
  const { data: refunds } = await stripe.refunds.list({
    charge: charge.id,
    limit: 100,
  });

  const result = await reverse_charge({
    donation_id: don.id,
    rail: "stripe",
    source: "dispute",
    source_ref: dispute.id,
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

/** the account settles in usd, so a fee in any other currency is no figure
 * this can owe */
const dispute_fee_usd = (d: Stripe.Dispute): number => {
  const { dispute_fee: fee } = dispute_fee(d);
  if (!fee) return 0;
  if (fee.currency !== "usd") {
    throw new Error(`dispute ${d.id} fee settled in ${fee.currency}, not usd`);
  }
  return from_stripe_amount(fee.amount, fee.currency);
};

/** an inquiry escalating to a chargeback stays the same dispute and sends no
 * second `created`: its `funds_withdrawn` is when there is something owed.
 * a chargeback opened outright withdraws as it opens, so both may arrive, in
 * either order */
type DisputeEvent =
  | Stripe.ChargeDisputeCreatedEvent
  | Stripe.ChargeDisputeFundsWithdrawnEvent;

export async function handle_dispute_opened(event: DisputeEvent) {
  const dispute = event.data.object;
  const don = await settled_donation(str_id(dispute.payment_intent));
  const on_record = (await disputes_of_donation(don.id)).find(
    (d) => d.id === dispute.id
  );
  // stripe doesn't order its events: a close handled first settled the gift,
  // and an open recorded now would owe what a win already credited
  if (on_record && on_record.status !== "open") return;

  if (dispute.status.startsWith("warning_")) {
    if (on_record) return;
    return record_only(event, don.id, [
      "an inquiry: stripe has withdrawn no funds, so nothing recorded as owed. if it escalates to a chargeback, what the gift's parties received is recorded as owed then.",
    ]);
  }
  const { charge, taken, partial } = await taken_from_charge(dispute);
  if (partial) {
    if (on_record) return;
    return record_only(event, don.id, [
      `part of the charge: ${money(taken, charge.currency)} of ${money(charge.amount, charge.currency)} taken back with earlier refunds, so nothing recorded as owed. if it is lost, settle the donation by hand.`,
    ]);
  }

  const res = await dispute_opened({
    donation_id: don.id,
    rail: "stripe",
    dispute_id: dispute.id,
    opened_at: iso(dispute.created),
    fee_usd: dispute_fee_usd(dispute),
  });
  if (res.status !== "recorded") return;

  // keyed on the dispute: a redelivery after a lost 200 collapses into this one
  await notify_opened(event, don.id, `${dispute.id}_owed`, [
    `recorded as owed: ${usd(res.owed.reduce((s, o) => s + owed_usd(o), 0))}`,
    ...res.owed.map(owed_line),
    "the donation stays settled while the dispute is open, and what is owed is recovered from each party's next grants. if the dispute is lost, the donation reverses without taking it twice; if won, what is owed is credited back.",
  ]);
}

/** a dispute put on record with nothing owed for it */
async function record_only(
  event: DisputeEvent,
  donation_id: string,
  why: string[]
) {
  const { id, created } = event.data.object;
  // ahead of the record: a lost notice fails the delivery with nothing
  // written, so the redelivery sends it
  await notify_opened(event, donation_id, `${id}_recorded`, why);
  await dispute_open(db, { id, donation_id, opened_at: iso(created) });
}

async function notify_opened(
  event: DisputeEvent,
  donation_id: string,
  notice_id: string,
  lines: string[]
) {
  const dispute = event.data.object;
  const due = dispute.evidence_details?.due_by;
  await enqueue(
    msg("fiat-notice", {
      id: notice_id,
      alert: {
        type: "NOTICE",
        from: `${ALERT_FROM}-${stage}`,
        title: "Stripe Dispute Opened",
        body: [
          dispute_line(dispute, donation_id, event.id),
          `amount: ${money(dispute.amount, dispute.currency)}, reason: ${dispute.reason}, status: ${dispute.status}`,
          `evidence due by: ${due ? iso(due) : "n/a"}`,
          ...lines,
        ].join("\n"),
      },
    })
  );
}

const usd = (n: number) => `${n.toFixed(2)} USD`;

const owed_usd = (o: IOwed) =>
  o.received_usd + o.fee_processing_usd + o.fee_dispute_usd;

const owed_line = (o: IOwed) => {
  const party =
    o.npo_id !== null
      ? `npo ${o.npo_id}`
      : `referrer ${o.referrer_user ?? `npo ${o.referrer_npo}`}`;
  return `- ${party}: ${usd(owed_usd(o))} (received ${usd(o.received_usd)}, card fee ${usd(o.fee_processing_usd)}, dispute fee ${usd(o.fee_dispute_usd)})`;
};
