import Stripe from "stripe";
import { dataWithError, dataWithSuccess } from "#/.server/toast";
import { report_error } from "#/errors/report";
import { str_id } from "#/helpers/stripe";
import type { IDonation } from "@/donations";
import { msg } from "@/queue";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { db } from "$/pg/db";
import { type DistRefundGraph, dists_for_refund } from "$/pg/queries/dist";
import { donation_get, donation_settlement_get } from "$/pg/queries/donation";
import { sub_update } from "$/pg/queries/subscription";
import {
  type FullRefund,
  reverse_after_partials,
} from "$/refund/after-partials";
import type { PreviewLine, RefundPreview } from "$/refund/plan";
import {
  load_refund_plan,
  process_refund,
  type RefundResult,
} from "$/refund/process";
import type { Route } from "./+types/route";

export interface DistPreview {
  id: string;
  npo_id: number;
  npo_name: string;
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

/** the subscription whose invoice `intent_id` paid, if any */
async function subscription_id_of(intent_id: string): Promise<string | null> {
  const { data: ips } = await stripe.invoicePayments.list({
    payment: { payment_intent: intent_id, type: "payment_intent" },
    expand: ["data.invoice"],
  });
  const inv = ips[0]?.invoice;
  const invoice = inv && typeof inv !== "string" && !inv.deleted ? inv : null;
  const sub = invoice?.parent?.subscription_details?.subscription;
  return sub ? str_id(sub) : null;
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
  for (const g of graphs) {
    const { dist } = g;
    if (dist.refund_status === "completed" || dist.refund_status === "loss") {
      previews.push({
        id: dist.id,
        npo_id: dist.to_id ?? 0,
        npo_name: dist.to_name ?? "",
        amount: dist.amount ?? 0,
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
    const p: RefundPreview = plan.preview;
    previews.push({
      id: dist.id,
      npo_id: dist.to_id ?? 0,
      npo_name: dist.to_name ?? "",
      amount: dist.amount ?? 0,
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

  const total_loss = previews.reduce(
    (sum, p) => sum + (p.warnings.length > 0 ? p.amount : 0),
    0
  );

  return {
    donation_id,
    already_refunded,
    previews,
    total_loss,
    subscription_id,
  } satisfies LoaderData;
};

/** the charge's refund for the rest of it: this attempt's, or one a retry past
 * stripe's idempotency window finds already made */
async function issue_refund(payment_intent: string, donation_id: string) {
  try {
    const created = await stripe.refunds.create(
      { payment_intent },
      { idempotencyKey: `refund_${donation_id}` }
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

/** the charge's refunds besides `completing_id`, newest first */
async function earlier_refunds(payment_intent: string, completing_id: string) {
  const { data } = await stripe.refunds.list({ payment_intent, limit: 100 });
  return data.filter((r) => r.id !== completing_id);
}

const ALERT_FROM = "refund-action";

async function cancel_subscription(sub_id: string) {
  const { row, prev_status } = await sub_update(db, sub_id, {
    status: "inactive",
    status_cancel_reason: "refunded",
    updated_at: new Date().toISOString(),
  });
  if (row && prev_status === "active") {
    await enqueue(msg("sub-deactivated", row));
  }
}

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
  toast: string
) =>
  dataWithError(
    {
      ok: false as const,
      failures,
      refund_issued: refund === "issued" || refund === "requires_action",
      refund,
      reversed,
    },
    toast
  );

/** stops the gift's billing, then reverses the donation `r` refunded */
async function finish_refund(
  r: Stripe.Refund,
  intent_id: string,
  don: IDonation,
  graphs: DistRefundGraph[]
): Promise<RefundResult> {
  // the donor is refunded whatever the reversal does next, so the gift stops
  // billing now
  const sub_id = await subscription_id_of(intent_id);
  if (sub_id) await cancel_subscription(sub_id);

  const full: FullRefund = {
    donation_id: don.id,
    seen_at: `payment ${intent_id}, admin refund ${r.id}`,
    currency: r.currency,
    completing: r,
    earlier: await earlier_refunds(intent_id, r.id),
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
  let r: Stripe.Refund;
  try {
    r = await issue_refund(intent_id, donation_id);
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
  if (r.status === "failed" || r.status === "canceled") {
    const failure = `Stripe refund ${r.id} is ${r.status}: nothing was reversed`;
    return incomplete("not_issued", [failure], 0, "Refund not issued");
  }
  // requires_action, chiefly. it can still expire to canceled, with no event
  // this app hears, so nothing is reversed until a retry finds it accepted
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
  let result: RefundResult;
  try {
    result = await finish_refund(r, intent_id, don, graphs);
  } catch (err) {
    report_error(err, { donation_id, refund_id: r.id });
    const reason = err instanceof Error ? err.message : String(err);
    return incomplete(
      "issued",
      [`Stripe refund ${r.id} was issued, then: ${reason}`],
      null,
      "Refund issued, reversal stopped"
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
    { ok: true as const, stripe_refund },
    "Refund processed"
  );
};
