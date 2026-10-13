import type Stripe from "stripe";
import { report_error } from "#/errors/report";
import { is_reversed } from "@/donations/settle";
import { type IAttempt, type IConnectTransferPayload, msg } from "@/queue";
import { stage } from "../env";
import { enqueue } from "../kit/queue";
import { stripe } from "../kit/stripe";
import { payout_cents } from "../payouts/transfer";
import { db } from "../pg/db";
import {
  dist_stripe_transfer_get,
  dist_stripe_transfer_set,
  npo_donation_get,
} from "../pg/queries/dist";
import { donation_status_shared } from "../pg/queries/donation";
import {
  type ChargeRefunds,
  charge_refunds,
  refund_take,
} from "../refund/unsent";
import { settle_unrouted, type TUnrouted } from "../settlement/settle-npo";
import { is_refusal } from "./refusal";
import { reverse_routed_refunds } from "./reverse";

/** pay a routed dist's net to the connected account settlement routed it to */
export async function transfer_routed_dist(
  p: IConnectTransferPayload,
  attempt: IAttempt
) {
  const stored = await dist_stripe_transfer_get(p.dist_id);
  if (stored === undefined) {
    report_error(new Error(`connect-transfer for missing dist ${p.dist_id}`), {
      donation_id: p.donation_id,
      dist_id: p.dist_id,
    });
    return;
  }
  // stored: a delivery retried after the reversal below threw, or a duplicate
  if (stored) return reverse_refunded_before(p, await charge_of(p));

  const dist = await npo_donation_get(p.dist_id);
  // a racing delivery stored its transfer after the read above
  if (!dist || dist.stripe_transfer_id) return;
  // a refusal rebooked it pooled; this delivery may be the retry of one whose
  // notice never went
  if (!dist.stripe_routed_to) return enqueue(refused_notice(p, "taken", 0));
  const npo_id = dist.to_id;
  if (npo_id === null) throw new Error(`dist ${p.dist_id} has no npo`);

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
  const net = dist.net ?? 0;
  let charge: string | undefined;
  let tr: Stripe.Transfer;
  try {
    charge = await charge_of(p);
    tr = await create_transfer(p, charge, dist.stripe_routed_to, net);
  } catch (e) {
    if (is_refusal(e)) {
      report_error(
        new Error(`${what} refused, settling it pooled`, { cause: e }),
        {
          donation_id: p.donation_id,
          dist_id: p.dist_id,
          destination: dist.stripe_routed_to,
          stripe_code: e.code,
        }
      );
      // refused reading the intent: there is no charge to have refunds
      const cut = charge ? refunds_cut(net, await charge_refunds(charge)) : 0;
      const r = await db.transaction((tx) =>
        settle_unrouted(tx, {
          id: dist.id,
          donation_id: p.donation_id,
          to_id: npo_id,
          net: net - cut,
          date_created: dist.date_created,
        })
      );
      const msgs = r.status === "booked" ? r.msgs : [];
      return enqueue(refused_notice(p, r.status, cut), ...msgs);
    }
    // no rebook: the transfer stripe never answered for may have been made
    if (attempt.last) await enqueue(unanswered_notice(p));
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
  await reverse_refunded_before(p, charge);
}

/**
 * usd the charge's live refunds take off a routed `net`: the cents their cut
 * of its transfer would have been (`refund_cuts` in `./reverse` cuts the same
 * total), all of it once they take the whole charge
 */
const refunds_cut = (
  net: number,
  { of, live }: Pick<ChargeRefunds, "of" | "live">
): number => {
  const taken = Math.min(
    live.reduce((sum, r) => sum + r.amount, 0),
    of
  );
  if (taken === 0) return 0;
  if (taken === of) return net;
  return Math.round((payout_cents([net]) * taken) / of) / 100;
};

const refused_notice = (
  p: IConnectTransferPayload,
  outcome: TUnrouted["status"],
  cut: number
) =>
  msg("fiat-notice", {
    id: `connect-refused_${p.dist_id}`,
    alert: {
      type: "NOTICE",
      from: `connect-transfer-${stage}`,
      title: "Routed Transfer Refused: Settled Pooled",
      body: [
        `donation ${p.donation_id}, dist ${p.dist_id}`,
        {
          reversed:
            "stripe refused the transfer to the nonprofit's connected account, and the donation was refunded in full meanwhile: the share was unrouted and nothing booked, since the donor has the money back.",
          booked:
            "stripe refused the transfer to the nonprofit's connected account, so its share was settled the way a pooled one is: into its balances and a pending payout the grants run pays like any other.",
          // a redelivery, after the delivery that unrouted it
          taken:
            "stripe refused the transfer to the nonprofit's connected account and the share is no longer routed: see this dist's balance and payout rows for what was booked.",
        }[outcome],
        ...(outcome === "booked" && cut > 0
          ? [
              `booked less ${cut} usd, its share of the charge's refunds, which the transfer would have reversed.`,
            ]
          : []),
        "check the nonprofit's stripe connection; later card gifts keep routing to it until it reads disconnected or not ready.",
      ].join("\n"),
    },
  });

const unanswered_notice = (p: IConnectTransferPayload) =>
  msg("fiat-notice", {
    id: `connect-unanswered_${p.dist_id}`,
    alert: {
      type: "ERROR",
      from: `connect-transfer-${stage}`,
      title: "Routed Transfer Unanswered",
      body: [
        `donation ${p.donation_id}, dist ${p.dist_id}`,
        `stripe never answered the transfer for this share, and nothing retries it. look in stripe for a transfer with metadata dist_id ${p.dist_id}: if there is one, the nonprofit was paid: store its id as the dist's stripe_transfer_id, or a refund won't reverse it. if not, the nonprofit is unpaid: the dist is still routed, with no payout row.`,
      ].join("\n"),
    },
  });

async function charge_of(p: IConnectTransferPayload) {
  const intent = await stripe.paymentIntents.retrieve(p.intent_id);
  const charge = intent.latest_charge;
  if (!charge) throw new Error(`intent ${p.intent_id} has no charge`);
  return typeof charge === "string" ? charge : charge.id;
}

/**
 * reverses the share of the transfer the charge's refunds took before it was
 * stored. a refund event reverses only a transfer already stored, so the
 * refunds it handled first are this one's; one that comes after finds it
 */
async function reverse_refunded_before(
  p: IConnectTransferPayload,
  charge: string
) {
  const { of, live, unsent } = await charge_refunds(charge);
  await reverse_routed_refunds(p.donation_id, {
    of,
    refunds: live.map(refund_take),
    unsent: unsent.map((r) => r.id),
  });
}

async function create_transfer(
  p: IConnectTransferPayload,
  charge: string,
  destination: string,
  net: number
) {
  return stripe.transfers.create(
    {
      // the cents the grants run would pay the same net
      amount: payout_cents([net]),
      // must be the charge's balance transaction currency; the stripe rail's
      // settlement (`net` included) is booked in usd
      currency: "usd",
      destination,
      source_transaction: charge,
      metadata: { donation_id: p.donation_id, dist_id: p.dist_id },
    },
    { idempotencyKey: `connect-transfer:${p.dist_id}` }
  );
}
