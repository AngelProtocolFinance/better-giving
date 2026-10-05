import Stripe from "stripe";
import { dataWithError, dataWithSuccess } from "#/.server/toast";
import { report_error } from "#/errors/report";
import { type IDonation, is_reversed } from "@/donations";
import { stripe } from "$/kit/stripe";
import { donation_get, donation_settlement_get } from "$/pg/queries/donation";
import {
  type DistPreview,
  has_settled_dists,
  reversal_preview,
  reverse_charge,
} from "$/refund/reverse";
import { subscription_id_of } from "$/refund/subscription";
import { is_failed_or_canceled, unsent_refunds } from "$/refund/unsent";
import type { Route } from "./+types/route";

export type { DistPreview };

/** a status stripe has taken the refund on: the money is on its way back */
export type StripeRefundStatus = "succeeded" | "pending";

const is_accepted = (s: string | null): s is StripeRefundStatus =>
  s === "succeeded" || s === "pending";

export interface LoaderData {
  donation_id: string;
  already_refunded: boolean;
  previews: DistPreview[];
  /** stripe subscription id if payment originated from a subscription */
  subscription_id: string | null;
}

// the preview only shows it, so a failed lookup costs nothing there
const preview_subscription_id = (intent_id: string | null) =>
  intent_id ? subscription_id_of(intent_id).catch(() => null) : null;

// the refund is issued through stripe, so a donation any other rail paid can't
// be refunded here: its dists would reverse while the donor got nothing back
async function stripe_donation(donation_id: string) {
  const don = await donation_get(donation_id);
  if (!don) throw new Response("donation not found", { status: 404 });
  if (!don.via.startsWith("stripe:")) {
    throw new Response(`not a stripe donation: ${don.via}`, { status: 400 });
  }
  return don;
}

export const loader = async ({ params }: Route.LoaderArgs) => {
  const { donation_id } = params;

  const don = await stripe_donation(donation_id);

  const sttl = await donation_settlement_get(donation_id);
  const subscription_id = await preview_subscription_id(sttl?.sttl_id ?? null);
  const preview = await reversal_preview(don, subscription_id);

  return {
    donation_id,
    already_refunded: is_reversed(don.status),
    previews: preview.dists,
    subscription_id,
  } satisfies LoaderData;
};

/** the idempotency key for refunding `payment_intent` now. one key per failed
 * attempt: submits racing before any failure share it, so the donor is
 * refunded once, and a retry after a refund stripe failed or canceled gets a
 * new one instead of a replay of the failure */
async function refund_key(payment_intent: string, donation_id: string) {
  const { data } = await stripe.refunds.list({ payment_intent, limit: 100 });
  const failed = data.filter(is_failed_or_canceled).length;
  return `refund_${donation_id}_${failed}`;
}

/** the charge's refund for the rest of it: this attempt's, or one a retry past
 * stripe's idempotency window finds already made */
async function issue_refund(payment_intent: string, idempotencyKey: string) {
  try {
    const created = await stripe.refunds.create(
      { payment_intent },
      { idempotencyKey }
    );
    // a replay inside the idempotency window answers with the first response,
    // not the refund as it stands now
    return await stripe.refunds.retrieve(created.id);
  } catch (err) {
    if (
      !(err instanceof Stripe.errors.StripeError) ||
      err.code !== "charge_already_refunded"
    ) {
      throw err;
    }
    // newest first: the one that completed the charge
    const { data } = await stripe.refunds.list({ payment_intent, limit: 1 });
    if (!data[0]) throw err;
    return data[0];
  }
}

const ALERT_FROM = "refund-action";

const already_refunded = () =>
  new Response("already refunded", { status: 400 });

/** thrown once the sdk's own retries are spent, by a request stripe may have
 * carried out before the answer was lost */
const outcome_unknown = (err: unknown) =>
  err instanceof Stripe.errors.StripeConnectionError ||
  (err instanceof Stripe.errors.StripeError && (err.statusCode ?? 0) >= 500);

/** where the donor's refund stands when the reversal doesn't complete */
export type RefundState =
  | "not_issued"
  | "unknown"
  | "requires_action"
  | "issued";

const incomplete = (
  refund: RefundState,
  failures: string[],
  reversed: number | null,
  toast: string,
  create_sent = true
) =>
  dataWithError(
    {
      ok: false as const,
      failures,
      refund_issued: refund === "issued" || refund === "requires_action",
      refund,
      reversed,
      /** false when the attempt stopped before asking stripe for the refund */
      create_sent,
    },
    toast
  );

/** reverses the donation `r` refunded, ending its billing, or holds the
 * reversal while a refund on the charge is unsent */
async function finish_refund(
  r: Stripe.Refund,
  intent_id: string,
  don: IDonation
) {
  const [{ data }, intent] = await Promise.all([
    stripe.refunds.list({ payment_intent: intent_id, limit: 100 }),
    stripe.paymentIntents.retrieve(intent_id, { expand: ["latest_charge"] }),
  ]);
  // newest first, with `r` as just retrieved rather than as the list read it
  const refunds = [r, ...data.filter((x) => x.id !== r.id)];
  const charge = intent.latest_charge;
  if (!charge || typeof charge === "string") {
    throw new Error(`payment ${intent_id} has no charge`);
  }
  // the charge's refunds to date, an earlier partial's and a pending one's
  // included: this refund completes it, so the share is whole. summed off the
  // list: stripe doesn't document whether `charge.amount_refunded` counts a
  // pending refund or drops a failed one
  const taken = refunds
    .filter((x) => !is_failed_or_canceled(x))
    .reduce((sum, x) => sum + x.amount, 0);
  const res = await reverse_charge({
    donation_id: don.id,
    rail: "stripe",
    source: "admin",
    share: { taken, of: charge.amount_captured },
    // an unsent one (a pending bank refund) can still fail, so the entry
    // holds: refund.updated reverses once the last succeeds
    unsent_refunds: unsent_refunds(refunds).map((x) => x.id),
    intent_id,
    source_ref: r.id,
    alert_from: ALERT_FROM,
    notice: { id: r.id, lines: [`payment ${intent_id}, admin refund ${r.id}`] },
  });
  if (
    res.status === "reversed" ||
    res.status === "already_reversed" ||
    res.status === "held"
  ) {
    return res;
  }
  if (res.status === "failed" && res.reason === "incomplete") return res;
  // the action checked the gift, its rail and its dists before the refund,
  // and the refund completes the charge: only a gift or charge changed under
  // this request lands here
  const why = res.status === "failed" ? res.reason : res.status;
  throw new Error(`nothing reversed: ${why}`);
}

export const action = async ({ params }: Route.ActionArgs) => {
  const { donation_id } = params;

  const don = await stripe_donation(donation_id);
  if (is_reversed(don.status)) throw already_refunded();

  if (!(await has_settled_dists(don.id)))
    throw new Response("no settled dists", { status: 400 });

  // with no payment to refund, reversing would take the gift back from the
  // nonprofit while the donor got nothing
  const sttl = await donation_settlement_get(donation_id);
  if (!sttl?.sttl_id)
    throw new Response("no stripe payment on record", { status: 400 });
  const intent_id = sttl.sttl_id;

  // the donor's refund goes first: records reversed ahead of a refund that
  // then fails would say refunded with nothing to take it back
  let key: string;
  try {
    key = await refund_key(intent_id, donation_id);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return incomplete(
      outcome_unknown(err) ? "unknown" : "not_issued",
      [
        `Stripe refund not issued, looking up earlier refunds failed: ${reason}`,
      ],
      0,
      "Refund not issued",
      false
    );
  }
  let r: Stripe.Refund;
  try {
    r = await issue_refund(intent_id, key);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (outcome_unknown(err)) {
      return incomplete(
        "unknown",
        [`Stripe refund unconfirmed: ${reason}`],
        0,
        "Refund unconfirmed"
      );
    }
    return incomplete(
      "not_issued",
      [`Stripe refund not issued: ${reason}`],
      0,
      "Refund not issued"
    );
  }
  if (is_failed_or_canceled(r)) {
    const failure = `Stripe refund ${r.id} is ${r.status}: nothing was reversed`;
    return incomplete("not_issued", [failure], 0, "Refund not issued");
  }
  // requires_action, chiefly. it can still expire to canceled, so nothing is
  // reversed here; once it succeeds refund.updated reverses it, or a retry
  // finds it accepted
  if (!is_accepted(r.status)) {
    const failure = `Stripe refund ${r.id} needs action before Stripe sends it (${r.status}): nothing was reversed`;
    return incomplete(
      "requires_action",
      [failure],
      0,
      "Refund awaiting action"
    );
  }
  const stripe_refund = r.status;

  // past here the donor is refunded, so the admin hears that whatever throws
  let result: Awaited<ReturnType<typeof finish_refund>>;
  try {
    result = await finish_refund(r, intent_id, don);
  } catch (err) {
    report_error(err, { donation_id, refund_id: r.id });
    const reason = err instanceof Error ? err.message : String(err);
    return incomplete(
      "issued",
      [`Stripe refund ${r.id} issued, reversal stopped: ${reason}`],
      null,
      "Refund issued, reversal stopped"
    );
  }

  if (result.status === "held") {
    return dataWithSuccess(
      { ok: true as const, stripe_refund, reversal: "held" as const },
      "Refund issued"
    );
  }

  if (result.status === "failed") {
    return incomplete(
      "issued",
      result.failures,
      result.applied,
      `Refund partial: ${result.failures.length} dist(s) failed`
    );
  }

  // already_reversed lands here too: past this request's own accepted refund,
  // whoever reversed first (its charge.refunded webhook, chiefly) finished it
  return dataWithSuccess(
    { ok: true as const, stripe_refund, reversal: "done" as const },
    "Refund processed"
  );
};
