import { report_error } from "#/errors/report";
import { type IDonation, reversed_statuses } from "@/donations";
import { msg } from "@/queue";
import { stage } from "../env";
import { enqueue } from "../kit/queue";
import { dists_for_refund } from "../pg/queries/dist";
import { donation_get } from "../pg/queries/donation";
import { type FullRefund, reverse_after_partials } from "./after-partials";
import { dist_settled_usd, type PreviewLine } from "./plan";
import { load_refund_plan, process_refund, type RefundResult } from "./process";

/** the provider family a gift was paid through, from its `via` */
export type Rail = "stripe" | "paypal" | "crypto";

/** the rail `via` names, or null for one nothing refunds (daf, stocks, ...) */
export function rail_of(via: string): Rail | null {
  if (via.startsWith("stripe")) return "stripe";
  if (via.startsWith("paypal")) return "paypal";
  if (via.startsWith("crypto")) return "crypto";
  return null;
}

export type ReversalSource = "refund" | "dispute" | "admin";

export interface Money {
  amount: number;
  currency: string;
}

interface RailAdapter {
  /** how a full reversal from `source` ends the recurring gift the payment
   * `sttl_id` belongs to, or null when it ends none */
  subscription_end(
    source: ReversalSource
  ): ((sttl_id: string) => Promise<void>) | null;
}

// loaded on use: `./subscription` builds a stripe client off env at import,
// which importing this entry from another rail must not need
async function cancel_stripe_subscription(intent_id: string) {
  const { cancel_refunded_subscription } = await import("./subscription");
  await cancel_refunded_subscription(intent_id);
}

const rail_adapters: Record<Rail, RailAdapter> = {
  stripe: {
    // a full refund of a subscription payment ends the recurring gift, from
    // whatever surface it was issued. a lost dispute doesn't
    subscription_end: (source) =>
      source === "dispute" ? null : cancel_stripe_subscription,
  },
  paypal: { subscription_end: () => null },
  crypto: { subscription_end: () => null },
};

export interface ChargeReversal {
  donation_id: string;
  rail: Rail;
  source: ReversalSource;
  /** the refunded or disputed share in the charge's currency, when it is short
   * of the rest of the charge; absent means the rest. carried, not yet acted
   * on: a share reverses nothing and ops settles it by hand */
  amount?: number;
  /** what the provider charged for the dispute. carried, not yet acted on */
  dispute_fee?: Money;
  /** discord sender identity, e.g. `charge-refunded`; the stage is appended */
  alert_from: string;
  /** the event's own lines for an ops notice, and its dedupe id: a redelivery
   * of the same event reuses it */
  notice: { id: string; lines: string[] };
  /** a full stripe refund after earlier partial refunds, which ops settled by
   * hand: the reversal is bracketed by notices saying when to undo that */
  after_partials?: Omit<
    FullRefund,
    "donation_id" | "alert_from" | "dist_count"
  >;
}

export type ReversalResult =
  | {
      status: "reversed";
      dists: number;
      applied: number;
      owed_msgs: string[];
      loss_msgs: string[];
      has_loss: boolean;
    }
  /** an earlier run took the money back: acknowledge, nothing written */
  | {
      status: "already_reversed";
      donation_status: (typeof reversed_statuses)[number];
    }
  /** part of the charge: nothing reversed, ops notified to settle it by hand */
  | { status: "partial_not_acted" }
  /** nothing reversed: no such gift, or it wasn't paid on `rail` */
  | { status: "failed"; reason: "no_donation" | "wrong_rail" }
  /** settled but no dist yet (the dist is queued after the settle): nothing
   * reversed, so a redelivery finds it */
  | { status: "failed"; reason: "not_distributed" }
  /** some dists failed to reverse: the gift stays settled, and a rerun
   * retries the failed ones and skips the rest */
  | {
      status: "failed";
      reason: "incomplete";
      dists: number;
      applied: number;
      failures: string[];
    };

const PARTIAL_REFUND = {
  title: "Partial Refund Not Reversed",
  action:
    "nothing was reversed automatically. if the rest is refunded later, the whole donation reverses automatically, so any hand adjustment made for these refunds must then be undone.",
};

const NOT_REVERSED: Record<ReversalSource, { title: string; action: string }> =
  {
    refund: PARTIAL_REFUND,
    admin: PARTIAL_REFUND,
    dispute: {
      title: "Lost Dispute Not Reversed",
      action:
        "nothing was reversed automatically: settle this donation by hand.",
    },
  };

/**
 * takes a gift back after its money went back to the donor: a refund, a lost
 * dispute, or an admin's refund. it loads the dists and runs the refund core
 * itself, so a caller hands over the event and maps the result to its ack.
 *
 * safe to rerun: a reversed gift is acknowledged, and an incomplete one is
 * finished by the next run.
 */
export async function reverse_charge(
  r: ChargeReversal
): Promise<ReversalResult> {
  const don = await donation_get(r.donation_id);
  if (!don) return { status: "failed", reason: "no_donation" };
  if (rail_of(don.via) !== r.rail) {
    return { status: "failed", reason: "wrong_rail" };
  }
  const reversed = reversed_statuses.find((s) => s === don.status);
  if (reversed) {
    return { status: "already_reversed", donation_status: reversed };
  }

  if (r.amount !== undefined) {
    const { title, action } = NOT_REVERSED[r.source];
    // awaited: a lost notice fails the delivery, so the provider redelivers it.
    // keyed on the event, so the redelivery posts one notice
    await enqueue(
      msg("fiat-notice", {
        id: r.notice.id,
        alert: {
          type: "NOTICE",
          from: `${r.alert_from}-${stage}`,
          title,
          body: [...r.notice.lines, action].join("\n"),
        },
      })
    );
    return { status: "partial_not_acted" };
  }

  // ahead of the reversal and whatever becomes of it: the donor has the money
  // back, so the gift stops billing even while a dist is left to retry
  const end_subscription = rail_adapters[r.rail].subscription_end(r.source);
  if (end_subscription && don.settlement) {
    await end_subscription(don.settlement.id);
  }

  // `r.donation_id` may be the v1 id `donation_get` also matches
  const graphs = await dists_for_refund(don.id);
  if (graphs.length === 0) {
    return { status: "failed", reason: "not_distributed" };
  }

  const reverse = () =>
    process_refund(don.id, graphs, {
      form_id: don.form_id ?? null,
      program_id: don.program?.id ?? null,
      alert_from: r.alert_from,
      source: r.source === "dispute" ? "dispute" : "refund",
      source_ref: r.notice.id,
    });
  const res = r.after_partials
    ? await reverse_after_partials(
        {
          ...r.after_partials,
          donation_id: r.donation_id,
          alert_from: r.alert_from,
          dist_count: graphs.length,
        },
        reverse
      )
    : await reverse();

  const failed = res.failures.length;
  console.info(
    `${r.alert_from}: reversed ${r.donation_id}, dists: ${graphs.length}, failures: ${failed}, owed: ${res.owed_msgs.length}, losses: ${res.loss_msgs.length}`
  );
  if (r.source === "dispute") await notify_dispute_lost(r, graphs.length, res);

  if (failed > 0) {
    return {
      status: "failed",
      reason: "incomplete",
      dists: graphs.length,
      applied: res.applied,
      failures: res.failures,
    };
  }
  return {
    status: "reversed",
    dists: graphs.length,
    applied: res.applied,
    owed_msgs: res.owed_msgs,
    loss_msgs: res.loss_msgs,
    has_loss: res.has_loss,
  };
}

/** whether `reverse_charge` would find dists to reverse, rather than answer
 * `not_distributed`. reads, plans nothing */
export async function has_settled_dists(donation_id: string) {
  return (await dists_for_refund(donation_id)).length > 0;
}

async function notify_dispute_lost(
  r: ChargeReversal,
  dists: number,
  res: RefundResult
) {
  const failed = res.failures.length;
  const title =
    failed === 0
      ? "Dispute Lost: Donation Reversed"
      : "Dispute Lost: Reversal Did Not Complete";
  const body = [
    ...r.notice.lines,
    failed === 0
      ? `all ${dists} dists reversed.`
      : `${failed} of ${dists} dists failed to reverse, and the donation stays settled.`,
    ...res.loss_msgs.map((m) => `loss: ${m}`),
    ...res.owed_msgs.map((m) => `owed: ${m}`),
  ].join("\n");
  // queued, not sent: once reversed, a redelivery stops at the guard, so only
  // the queue's retries can land a failed send. keyed on the outcome, so a
  // redelivery failing alike collapses into this notice
  await enqueue(
    msg("fiat-notice", {
      id: `${r.notice.id}_${failed}`,
      alert: { type: "NOTICE", from: `${r.alert_from}-${stage}`, title, body },
    })
  ).catch((err) =>
    report_error(err, { donation_id: r.donation_id, title, body })
  );
}

export interface DistPreview {
  id: string;
  npo_id: number;
  npo_name: string;
  /** usd */
  amount: number;
  net: number;
  refund_status: string | null;
  refund_error?: string | null;
  /** usd the npo would owe back, recovered from its future grants; 0 when none */
  owed: number;
  /** what will happen when the refund is processed */
  effects: PreviewLine[];
  /** blockers preventing the refund from proceeding */
  blockers: PreviewLine[];
  /** non-reversible items — refund proceeds; the npo owes them back, or a paid commission is the platform's loss */
  warnings: PreviewLine[];
}

export interface ReversalPreview {
  /** one per settled dist; none means there is nothing to reverse yet */
  dists: DistPreview[];
  /** usd the platform would absorb as loss: commissions already paid out */
  total_loss: number;
}

/** what reversing `don` would do to each of its dists, writing nothing.
 * `sub_id` is the recurring gift the payment billed, if any */
export async function reversal_preview(
  don: IDonation,
  sub_id: string | null
): Promise<ReversalPreview> {
  const graphs = await dists_for_refund(don.id);

  const dists: DistPreview[] = [];
  let total_loss = 0;
  for (const g of graphs) {
    const { dist } = g;
    const amount = dist_settled_usd({
      net: dist.net ?? 0,
      fee_base: dist.fee_base ?? 0,
      fee_fsa: dist.fee_fsa ?? 0,
      fee_processing: dist.fee_processing ?? 0,
      fee_allowance: dist.fee_allowance ?? 0,
    });
    if (dist.refund_status === "completed" || dist.refund_status === "loss") {
      dists.push({
        id: dist.id,
        npo_id: dist.to_id ?? 0,
        npo_name: dist.to_name ?? "",
        amount,
        net: dist.net ?? 0,
        refund_status: dist.refund_status,
        owed: 0,
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
      sub_id,
      strict: false,
    });
    total_loss += plan.paid_commission?.amount ?? 0;
    const p = plan.preview;
    dists.push({
      id: dist.id,
      npo_id: dist.to_id ?? 0,
      npo_name: dist.to_name ?? "",
      amount,
      net: dist.net ?? 0,
      refund_status: dist.refund_status,
      refund_error: dist.refund_error,
      owed: plan.is_loss ? plan.amount : 0,
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
  return { dists, total_loss };
}
