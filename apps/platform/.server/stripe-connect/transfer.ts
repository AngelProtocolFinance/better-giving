import Stripe from "stripe";
import { report_error } from "#/errors/report";
import { is_reversed } from "@/donations/settle";
import type { IConnectTransferPayload } from "@/queue";
import { stripe } from "../kit/stripe";
import { payout_cents } from "../payouts/transfer";
import { db } from "../pg/db";
import {
  dist_stripe_transfer_get,
  dist_stripe_transfer_set,
  dists_routed_untransferred,
} from "../pg/queries/dist";
import { donation_status_shared } from "../pg/queries/donation";

/** pay a routed dist's net to the connected account settlement routed it to */
export async function transfer_routed_dist(p: IConnectTransferPayload) {
  if (await dist_stripe_transfer_get(p.dist_id)) return;

  const dists = await dists_routed_untransferred(p.donation_id);
  const dist = dists.find((d) => d.id === p.dist_id);
  // stored since the read above
  if (!dist) return;

  // the donor has the money back; a refund that lands after this check meets
  // a transfer it has to reverse
  const status = await donation_status_shared(db, p.donation_id);
  if (status && is_reversed(status)) {
    report_error(
      new Error(`donation ${p.donation_id} ${status} before its transfer`),
      { donation_id: p.donation_id, dist_id: p.dist_id, status }
    );
    return;
  }

  const what = `stripe transfer for dist ${p.dist_id} of donation ${p.donation_id}`;
  let tr: Stripe.Transfer;
  try {
    tr = await create_transfer(p, dist.stripe_routed_to, dist.net ?? 0);
  } catch (e) {
    if (is_refusal(e)) {
      // the npo is unpaid until someone decides where its share goes; its dist
      // stays routed and untransferred, which `dists_routed_untransferred` lists
      report_error(
        new Error(`${what} refused, needs manual handling`, { cause: e }),
        {
          donation_id: p.donation_id,
          dist_id: p.dist_id,
          destination: dist.stripe_routed_to,
          stripe_code: e.code,
        }
      );
      return;
    }
    // thrown, not reported: the queue route's error handler reports what
    // escapes it, and qstash retries the delivery
    throw new Error(`${what} failed`, { cause: e });
  }
  const r = await dist_stripe_transfer_set(p.dist_id, tr.id);
  // the same id is a racing delivery that got stripe's idempotent reply
  if (!r.set && r.existing !== tr.id) {
    report_error(new Error(`dist ${p.dist_id} paid by two transfers`), {
      donation_id: p.donation_id,
      dist_id: p.dist_id,
      transfer_id: tr.id,
      stored_transfer_id: r.existing,
    });
  }
}

async function create_transfer(
  p: IConnectTransferPayload,
  destination: string,
  net: number
) {
  const intent = await stripe.paymentIntents.retrieve(p.intent_id);
  const charge = intent.latest_charge;
  if (!charge) throw new Error(`intent ${p.intent_id} has no charge`);

  return stripe.transfers.create(
    {
      // the cents the grants run would pay the same net
      amount: payout_cents([net]),
      // must be the charge's balance transaction currency; the stripe rail's
      // settlement (`net` included) is booked in usd
      currency: "usd",
      destination,
      source_transaction: typeof charge === "string" ? charge : charge.id,
      metadata: { donation_id: p.donation_id, dist_id: p.dist_id },
    },
    { idempotencyKey: `connect-transfer:${p.dist_id}` }
  );
}

/**
 * stripe answered and said no: a revoked or unpayable account, a charge it
 * won't fund from. a retry sends the same request under the same idempotency
 * key, which stripe answers the same way, so only a person can move it
 */
const is_refusal = (
  e: unknown
): e is
  | Stripe.errors.StripeInvalidRequestError
  | Stripe.errors.StripePermissionError =>
  e instanceof Stripe.errors.StripeInvalidRequestError ||
  e instanceof Stripe.errors.StripePermissionError;
