import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { report_error } from "#/errors/report";
import { str_id } from "#/helpers/stripe";
import { type IDonation, is_reversed } from "@/donations";
import { msg } from "@/queue";
import { stage } from "$/env";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { money } from "$/kit/stripe-money";
import { db } from "$/pg/db";
import { donations } from "$/pg/schema/donation";
import { refund_failed } from "$/refund/failed";
import { is_failed_or_canceled } from "$/refund/unsent";
import { settled_donation } from "../helpers/settled-donation";

/** what of the charge the gift has on record as taken back, in the charge's
 * minor unit: all of it once reversed, else the share its partials recorded */
async function recorded_taken(don: IDonation, of: number) {
  if (is_reversed(don.status)) return of;
  const [row] = await db
    .select({ share: donations.refunded_share })
    .from(donations)
    .where(eq(donations.id, don.id));
  return Math.round((row?.share ?? 0) * of);
}

/**
 * a refund stripe failed. one that failed while held took nothing back, so
 * finance is only told; one that failed after it succeeded has its part of
 * what each party was recorded as owing credited back, and finance told what
 * was credited and what to undo by hand.
 */
export async function handle_refund_failed(event: Stripe.RefundFailedEvent) {
  const refund = event.data.object;
  const don = await settled_donation(str_id(refund.payment_intent));
  const charge = await stripe.charges.retrieve(str_id(refund.charge));
  const { data: refunds } = await stripe.refunds.list({
    charge: charge.id,
    limit: 100,
  });
  const of = charge.amount_captured;
  const live = refunds
    .filter((r) => r.id !== refund.id && !is_failed_or_canceled(r))
    .reduce((sum, r) => sum + r.amount, 0);
  // what the record holds beyond what the live refunds still take back is
  // this refund's: none when it failed while held
  const counted = Math.min(
    refund.amount,
    (await recorded_taken(don, of)) - live
  );

  const alert = (outcome: string[]) => {
    const title = "Stripe Refund Failed";
    const body = [
      `donation ${don.id}, refund ${refund.id}, event ${event.id}`,
      `amount: ${money(refund.amount, refund.currency)}`,
      `failure reason: ${refund.failure_reason ?? "unknown"}`,
      ...outcome,
    ].join("\n");
    // keyed on the refund: a redelivery after a lost 200 collapses into this one
    const sent = enqueue(
      msg("fiat-notice", {
        id: refund.id,
        alert: { type: "ERROR", from: `refund-failed-${stage}`, title, body },
      })
    );
    return { sent, title, body };
  };

  if (counted <= 0) {
    // awaited: nothing was written, so a redelivery tells it the same
    await alert([
      `the refund had taken nothing back from the donation (status ${don.status}): nothing was changed automatically.`,
    ]).sent;
    return;
  }

  const res = await refund_failed({
    donation_id: don.id,
    rail: "stripe",
    failed_share: { taken: counted, of },
    share: { taken: live, of },
    source_ref: refund.id,
  });
  if (res.status === "failed") {
    throw new Error(`refund ${refund.id} not credited back: ${res.reason}`);
  }
  const { sent, title, body } = alert([
    `the donation stays ${res.donation_status}. what the refund had taken back is credited back:`,
    ...res.credited,
    ...(res.status === "by_hand" ? ["undo by hand:", ...res.by_hand] : []),
  ]);
  // reported, not redelivered: a redelivery reads the credit as made and
  // would tell finance nothing was credited
  await sent.catch((err) =>
    report_error(err, { donation_id: don.id, title, body })
  );
}
