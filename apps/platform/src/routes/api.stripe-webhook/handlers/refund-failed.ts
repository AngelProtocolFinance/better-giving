import type Stripe from "stripe";
import { report_error } from "#/errors/report";
import { str_id } from "#/helpers/stripe";
import { humanize } from "@/helpers/decimal";
import { msg } from "@/queue";
import { stage } from "$/env";
import { enqueue } from "$/kit/queue";
import { money } from "$/kit/stripe-money";
import { db } from "$/pg/db";
import { type IOwed, owed_for_donation } from "$/pg/queries/owed";
import { refunds_credited_back } from "$/pg/queries/owed-refund";
import { refund_failed } from "$/refund/failed";
import { settled_donation } from "../helpers/settled-donation";

const row_line = (o: IOwed) =>
  `${o.npo_id !== null ? `npo ${o.npo_id}` : `referrer ${o.referrer_user ?? `npo ${o.referrer_npo}`}`}: $${humanize(o.credited_back_usd)} credited back in all; outstanding now $${humanize(o.outstanding_usd ?? 0)}`;

/**
 * a refund stripe failed. one that failed after it succeeded has its part of
 * what each party was recorded as owing credited back, and finance is told
 * what was credited and what to undo by hand; one that failed while held
 * took nothing back, so finance is only told.
 */
export async function handle_refund_failed(event: Stripe.RefundFailedEvent) {
  const refund = event.data.object;
  const don = await settled_donation(str_id(refund.payment_intent));

  const res = await refund_failed({
    donation_id: don.id,
    rail: "stripe",
    refund_id: refund.id,
  });
  if (res.status === "failed") {
    throw new Error(`refund ${refund.id} not credited back: ${res.reason}`);
  }

  const title = "Stripe Refund Failed";
  const body = (outcome: string[]) =>
    [
      `donation ${don.id}, refund ${refund.id}, event ${event.id}`,
      `amount: ${money(refund.amount, refund.currency)}`,
      `failure reason: ${refund.failure_reason ?? "unknown"}`,
      ...outcome,
    ].join("\n");
  // keyed on the refund: a redelivery after a lost 200 collapses into this one
  const send = (text: string) =>
    enqueue(
      msg("fiat-notice", {
        id: refund.id,
        alert: {
          type: "ERROR",
          from: `refund-failed-${stage}`,
          title,
          body: text,
        },
      })
    );

  if (res.status === "not_recorded") {
    const credited = await refunds_credited_back(db, don.id, [refund.id]);
    // a delivery that credited it and died before its alert landed
    const text = credited.has(refund.id)
      ? body([
          `the donation stays ${res.donation_status}. an earlier delivery already credited back what the refund had taken back; each party's row now:`,
          ...(await owed_for_donation(don.id)).map(row_line),
        ])
      : body([
          `the refund had taken nothing back from the donation (status ${res.donation_status}): nothing was changed automatically.`,
        ]);
    // awaited: nothing was written, so a redelivery tells it the same
    await send(text);
    return;
  }

  const text = body([
    `the donation stays ${res.donation_status}. what the refund had taken back is credited back:`,
    ...res.credited,
    ...(res.status === "by_hand" ? ["undo by hand:", ...res.by_hand] : []),
  ]);
  // reported, not redelivered: a redelivery finds the credit made and tells
  // it as an earlier delivery's, without these lines
  await send(text).catch((err) =>
    report_error(err, { donation_id: don.id, title, body: text })
  );
}
