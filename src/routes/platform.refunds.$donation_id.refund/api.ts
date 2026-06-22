import { dataWithError, dataWithSuccess } from "#/.server/toast";
import { str_id } from "#/helpers/stripe";
import * as sub_deactivated from "@/queue/msgs/sub-deactivated";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { db } from "$/pg/db";
import { dists_for_refund } from "$/pg/queries/dist";
import { donation_get, donation_settlement_get } from "$/pg/queries/donation";
import { sub_update } from "$/pg/queries/subscription";
import type { PreviewLine, RefundPreview } from "$/refund/plan";
import { load_refund_plan, process_refund } from "$/refund/process";
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

export interface LoaderData {
  donation_id: string;
  already_refunded: boolean;
  previews: DistPreview[];
  /** total amount platform will absorb as loss */
  total_loss: number;
  /** stripe subscription id if payment originated from a subscription */
  subscription_id: string | null;
}

async function lookup_subscription_id(
  intent_id: string | null
): Promise<string | null> {
  if (!intent_id) return null;
  try {
    const { data: ips } = await stripe.invoicePayments.list({
      payment: { payment_intent: intent_id, type: "payment_intent" },
      expand: ["data.invoice"],
    });
    const inv = ips[0]?.invoice;
    const invoice = inv && typeof inv !== "string" && !inv.deleted ? inv : null;
    const sub = invoice?.parent?.subscription_details?.subscription;
    return sub ? str_id(sub) : null;
  } catch {
    // stripe lookup failure is non-blocking
    return null;
  }
}

export const loader = async ({ params }: Route.LoaderArgs) => {
  const { donation_id } = params;

  const don = await donation_get(donation_id);
  if (!don) throw new Response("donation not found", { status: 404 });

  const already_refunded =
    don.status === "refunded" || don.status === "refunded_loss";
  const graphs = await dists_for_refund(donation_id);

  const sttl = await donation_settlement_get(donation_id);
  const subscription_id = await lookup_subscription_id(sttl?.sttl_id ?? null);

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
    if (dist.refund_status === "failed") {
      previews.push({
        id: dist.id,
        npo_id: dist.to_id ?? 0,
        npo_name: dist.to_name ?? "",
        amount: dist.amount ?? 0,
        net: dist.net ?? 0,
        refund_status: dist.refund_status,
        refund_error: dist.refund_error,
        effects: [],
        blockers: [
          {
            label: "Previously failed",
            pass: false,
            reason: dist.refund_error ?? "unknown",
          },
        ],
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
      effects: p.effects,
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

export const action = async ({ params }: Route.ActionArgs) => {
  const { donation_id } = params;

  const don = await donation_get(donation_id);
  if (!don) throw new Response("donation not found", { status: 404 });
  if (don.status === "refunded" || don.status === "refunded_loss")
    throw new Response("already refunded", { status: 400 });

  const graphs = await dists_for_refund(donation_id);
  if (graphs.length === 0)
    throw new Response("no settled dists", { status: 400 });

  const sttl = await donation_settlement_get(donation_id);
  const intent_id = sttl?.sttl_id ?? null;
  const sub_id = await lookup_subscription_id(intent_id);

  const result = await process_refund(donation_id, graphs, {
    form_id: don.form_id ?? null,
    program_id: don.program?.id ?? null,
    alert_from: "refund-action",
  });

  // if any dist reversal failed, skip stripe + sub cancel so the donor isn't
  // refunded until the failed dist is investigated. admin retries via the
  // already-refunded 400 will bounce; failed dists must be fixed first.
  if (result.failures.length > 0) {
    return dataWithError(
      { ok: false, failures: result.failures },
      `Refund partial: ${result.failures.length} dist(s) failed`
    );
  }

  // stripe refund — manual route only
  if (intent_id) {
    await stripe.refunds.create({ payment_intent: intent_id });
  }

  // sub cancel — manual route only
  if (sub_id) {
    const { row, prev_status } = await sub_update(db, sub_id, {
      status: "inactive",
      status_cancel_reason: "refunded",
      updated_at: new Date().toISOString(),
    });
    if (row && prev_status === "active") {
      await enqueue(sub_deactivated.to_msg(row));
    }
  }

  return dataWithSuccess({ ok: true }, "Refund processed");
};
