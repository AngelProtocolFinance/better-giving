import Stripe from "stripe";
import { dataWithError, dataWithSuccess } from "#/.server/toast";
import { report_error } from "#/errors/report";
import type { IDonation } from "@/donations";
import { stripe } from "$/kit/stripe";
import { type DistRefundGraph, dists_for_refund } from "$/pg/queries/dist";
import { donation_get, donation_settlement_get } from "$/pg/queries/donation";
import {
  earlier_partials,
  type FullRefund,
  is_failed_or_canceled,
  reverse_after_partials,
  unsent_refunds,
} from "$/refund/after-partials";
import {
  dist_amount_usd,
  type PreviewLine,
  type RefundPreview,
} from "$/refund/plan";
import {
  load_refund_plan,
  process_refund,
  type RefundResult,
} from "$/refund/process";
import {
  cancel_refunded_subscription,
  subscription_id_of,
} from "$/refund/subscription";
import type { Route } from "./+types/route";

export interface DistPreview {
  id: string;
  npo_id: number;
  npo_name: string;
  /** usd */
  amount: number;
  net: number;
  refund_status: string | null;
  refund_error?: string | null;
  /** what will happen when the refund is processed */
  effects: PreviewLine[];
  /** blockers preventing the refund from proceeding */
  blockers: PreviewLine[];
  /** non-reversible items — refund proceeds, platform absorbs loss */
  warnings: PreviewLine[];
}

/** a status stripe has taken the refund on: the money is on its way back */
export type StripeRefundStatus = "succeeded" | "pending";

const is_accepted = (s: string | null): s is StripeRefundStatus =>
  s === "succeeded" || s === "pending";

export interface LoaderData {
  donation_id: string;
  already_refunded: boolean;
  previews: DistPreview[];
  /** total amount platform will absorb as loss */
  total_loss: number;
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

  const already_refunded =
    don.status === "refunded" || don.status === "refunded_loss";
  const graphs = await dists_for_refund(donation_id);

  const sttl = await donation_settlement_get(donation_id);
  const subscription_id = await preview_subscription_id(sttl?.sttl_id ?? null);

  const previews: DistPreview[] = [];
  let total_loss = 0;
  for (const g of graphs) {
    const { dist } = g;
    const amount = dist_amount_usd({
      amount_usd: dist.amount_usd,
      net: dist.net ?? 0,
      fee_base: dist.fee_base ?? 0,
      fee_fsa: dist.fee_fsa ?? 0,
      fee_processing: dist.fee_processing ?? 0,
    });
    if (dist.refund_status === "completed" || dist.refund_status === "loss") {
      previews.push({
        id: dist.id,
        npo_id: dist.to_id ?? 0,
        npo_name: dist.to_name ?? "",
        amount,
        net: dist.net ?? 0,
        refund_status: dist.refund_status,
        effects: [
          {
            label:
              dist.refund_status === "loss"
                ? "Completed with losses"
                : "Already completed",
            pass: true,
          },
        ],
        blockers: [],
        warnings: [],
      });
      continue;
    }
    const plan = await load_refund_plan(g, {
      form_id: don.form_id ?? null,
      program_id: don.program?.id ?? null,
      sub_id: subscription_id,
      strict: false,
    });
    total_loss +=
      (plan.is_loss ? plan.amount : 0) + (plan.paid_commission?.amount ?? 0);
    const p: RefundPreview = plan.preview;
    previews.push({
      id: dist.id,
      npo_id: dist.to_id ?? 0,
      npo_name: dist.to_name ?? "",
      amount,
      net: dist.net ?? 0,
      refund_status: dist.refund_status,
      refund_error: dist.refund_error,
      // process_refund retries a failed dist, so it shows as a retry, not a blocker
      effects:
        dist.refund_status === "failed"
          ? [
              {
                label: "Retry failed reversal",
                pass: true,
                reason: dist.refund_error ?? "unknown",
              },
              ...p.effects,
            ]
          : p.effects,
      blockers: p.blockers,
      warnings: p.warnings,
    });
  }

  return {
    donation_id,
    already_refunded,
    previews,
    total_loss,
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

/** stops the gift's billing, then reverses the donation `r` refunded, or
 * holds the reversal while a refund on the charge is unsent */
async function finish_refund(
  r: Stripe.Refund,
  intent_id: string,
  don: IDonation,
  graphs: DistRefundGraph[]
): Promise<RefundResult | "held"> {
  // the donor is refunded whatever the reversal does next, so the gift stops
  // billing now
  await cancel_refunded_subscription(intent_id);

  const [{ data }, intent] = await Promise.all([
    stripe.refunds.list({ payment_intent: intent_id, limit: 100 }),
    stripe.paymentIntents.retrieve(intent_id),
  ]);
  // newest first, with `r` as just retrieved rather than as the list read it
  const refunds = [r, ...data.filter((x) => x.id !== r.id)];
  // an unsent one (a pending bank refund) can still fail: refund.updated
  // reverses once the last succeeds
  if (unsent_refunds(refunds).length > 0) return "held";

  const full: FullRefund = {
    donation_id: don.id,
    seen_at: `payment ${intent_id}, admin refund ${r.id}`,
    currency: r.currency,
    completing: r,
    earlier: earlier_partials(refunds, r, intent.amount_received),
    alert_from: ALERT_FROM,
    dist_count: graphs.length,
  };
  return reverse_after_partials(full, () =>
    process_refund(don.id, graphs, {
      form_id: don.form_id ?? null,
      program_id: don.program?.id ?? null,
      alert_from: ALERT_FROM,
    })
  );
}

export const action = async ({ params }: Route.ActionArgs) => {
  const { donation_id } = params;

  const don = await stripe_donation(donation_id);
  if (don.status === "refunded" || don.status === "refunded_loss")
    throw new Response("already refunded", { status: 400 });

  const graphs = await dists_for_refund(donation_id);
  if (graphs.length === 0)
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
  let result: RefundResult | "held";
  try {
    result = await finish_refund(r, intent_id, don, graphs);
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

  if (result === "held") {
    return dataWithSuccess(
      { ok: true as const, stripe_refund, reversal: "held" as const },
      "Refund issued"
    );
  }

  if (result.failures.length > 0) {
    return incomplete(
      "issued",
      result.failures,
      result.applied,
      `Refund partial: ${result.failures.length} dist(s) failed`
    );
  }

  return dataWithSuccess(
    { ok: true as const, stripe_refund, reversal: "done" as const },
    "Refund processed"
  );
};
