import { report_error } from "#/errors/report";
import { type IDonation, reversed_statuses } from "@/donations";
import { humanize } from "@/helpers/decimal";
import { msg } from "@/queue";
import { stage } from "../env";
import { enqueue } from "../kit/queue";
import { dists_for_refund } from "../pg/queries/dist";
import { donation_get } from "../pg/queries/donation";
import { record_share } from "./partial";
import { dist_settled_usd, type PreviewLine } from "./plan";
import { load_refund_plan, process_refund, type RefundResult } from "./process";
import { fraction_of, type Share } from "./share";

export { type Share, WHOLE } from "./share";

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

interface RailAdapter {
  /** how a full reversal from `source` ends the recurring gift the payment
   * `payment_id` belongs to, or null when it ends none */
  subscription_end(
    source: ReversalSource
  ): ((payment_id: string) => Promise<void>) | null;
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
  /** how much of the charge is taken back so far, this event included. the
   * whole reverses the gift; less records each party's share of it as owed.
   * null when the provider can't say: nothing is reversed, ops told */
  share: Share | null;
  /** what the provider charged for the dispute, in usd. a share owes it in
   * full; a full loss owes what the dispute's open recorded */
  dispute_fee_usd?: number;
  /** the provider's own refund or dispute id, recorded on what a party owes;
   * absent records `notice.id` */
  source_ref?: string;
  /** the provider's refunds `share.taken` counts, by id: one whose failure
   * was already credited back (`refund_failed`) is taken out of a share short
   * of the whole, so a list read before it failed doesn't owe it again */
  refunds?: { id: string; amount: number }[];
  /** the provider's refunds on the charge not yet sent, which can still
   * fail: while any is, nothing is reversed or recorded as owed */
  unsent_refunds?: string[];
  /** stripe's payment intent behind the charge: whose recurring gift a full
   * refund ends. absent, the gift's settlement names it */
  intent_id?: string;
  /** discord sender identity, e.g. `charge-refunded`; the stage is appended */
  alert_from: string;
  /** the event's own lines for an ops notice, and its dedupe id: a redelivery
   * of the same event reuses it */
  notice: { id: string; lines: string[] };
}

export type ReversalResult =
  | {
      status: "reversed";
      dists: number;
      applied: number;
      owed_msgs: string[];
      has_loss: boolean;
    }
  /** an earlier run took the money back: acknowledge, nothing written */
  | {
      status: "already_reversed";
      donation_status: (typeof reversed_statuses)[number];
    }
  /** part of the charge: every party's share recorded as owed, nothing
   * reversed. `owed_msgs`: each party's row as it stands */
  | { status: "partial_owed"; owed_msgs: string[] }
  /** part of the charge, and some dist's grant hasn't gone out (its payout
   * pending, or its share still in the npo's balances): nothing recorded for
   * it, nothing reversed, and ops told to settle it by hand. `owed_msgs`: the
   * rows the gift's other parties owe as they stand */
  | { status: "partial_pending"; owed_msgs: string[] }
  /** a refund on the charge is unsent: nothing reversed or recorded, and a
   * full refund's recurring gift ended all the same */
  | { status: "held" }
  /** no share to size the event by: nothing reversed, ops told to settle it
   * by hand */
  | { status: "unsized" }
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

export type Unreversible = Extract<
  ReversalResult,
  { status: "already_reversed" } | { reason: "no_donation" | "wrong_rail" }
>;

/** the gift a reversal-side event acts on, or why it acts on none: no such
 * gift, not paid on `rail`, or its money already taken back. a gift that
 * exists comes back with either, so the event can still be put on record */
export async function load_reversible(
  donation_id: string,
  rail: Rail
): Promise<
  | { status: "reversible"; don: IDonation }
  | (Extract<Unreversible, { status: "already_reversed" }> & {
      don: IDonation;
    })
  | Extract<Unreversible, { status: "failed" }>
> {
  const don = await donation_get(donation_id);
  if (!don) return { status: "failed", reason: "no_donation" };
  if (rail_of(don.via) !== rail) {
    return { status: "failed", reason: "wrong_rail" };
  }
  const reversed = reversed_statuses.find((s) => s === don.status);
  if (reversed) {
    return { status: "already_reversed", donation_status: reversed, don };
  }
  return { status: "reversible", don };
}

/** the guard's answer, without the gift it loaded */
export const unreversible = (
  u: Exclude<
    Awaited<ReturnType<typeof load_reversible>>,
    { status: "reversible" }
  >
): Unreversible =>
  u.status === "already_reversed"
    ? { status: u.status, donation_status: u.donation_status }
    : u;

const UNSIZED_ACTION =
  "how much of the charge is taken back could not be read, so this reversal could not be sized against the charge. nothing was reversed automatically: settle it by hand.";

/** what a later event does on top of a hand adjustment for these dists */
const LATER_EVENTS =
  "any hand adjustment made for these dists must be undone if the rest is refunded or lost to a dispute, which reverses the donation, or if, once the grant has gone out, a later refund or dispute records as owed the whole share taken back so far, this one included; otherwise they are debited twice. a dispute filed while the grant is still pending records only its own share, so the adjustment stands then.";

const PARTIAL_REFUND = {
  owed: "Partial Refund Recorded as Owed",
  pending: "Partial Refund Not Reversed",
  action: `nothing was reversed automatically for these dists. ${LATER_EVENTS}`,
};

const SHARE_NOTICE: Record<
  ReversalSource,
  { owed: string; pending: string; action: string }
> = {
  refund: PARTIAL_REFUND,
  admin: PARTIAL_REFUND,
  dispute: {
    owed: "Lost Dispute: Share Recorded as Owed",
    pending: "Lost Dispute Not Reversed",
    action: `nothing was reversed automatically for these dists: settle them by hand. ${LATER_EVENTS}`,
  },
};

/**
 * takes a gift back after its money went back to the donor: a refund, a lost
 * dispute, or an admin's refund. the whole charge reverses the gift; part of
 * it records each party's share as owed, reversing nothing. it loads the
 * dists and runs the refund core itself, so a caller hands over the event and
 * maps the result to its ack.
 *
 * safe to rerun: a reversed gift is acknowledged, a share already recorded
 * stays as it is, and an incomplete reversal is finished by the next run.
 */
export async function reverse_charge(
  r: ChargeReversal
): Promise<ReversalResult> {
  const loaded = await load_reversible(r.donation_id, r.rail);
  if (loaded.status !== "reversible") return unreversible(loaded);
  const { don } = loaded;

  const f = r.share && fraction_of(r.share);
  if (f === null) {
    // awaited: a lost notice fails the delivery, so the provider redelivers
    // it. keyed on the event, so the redelivery posts one notice
    await enqueue(
      msg("fiat-notice", {
        id: r.notice.id,
        alert: {
          type: "NOTICE",
          from: `${r.alert_from}-${stage}`,
          title: "Reversal Not Sized",
          body: [...r.notice.lines, UNSIZED_ACTION].join("\n"),
        },
      })
    );
    return { status: "unsized" };
  }
  const partial = f < 1;

  // ahead of the reversal and whatever becomes of it, a held one included:
  // the donor has the money back, so the gift stops billing even while a
  // refund is unsent or a dist is left to retry
  const end_subscription = rail_adapters[r.rail].subscription_end(r.source);
  const payment_id = r.intent_id ?? don.settlement?.id;
  if (!partial && end_subscription && payment_id) {
    await end_subscription(payment_id);
  }
  if (r.unsent_refunds?.length) {
    console.info(
      `${r.alert_from}: reversal of ${don.id} held on ${r.unsent_refunds.join(", ")}`
    );
    return { status: "held" };
  }
  if (partial) return reverse_share(r, don.id, f);

  // `r.donation_id` may be the v1 id `donation_get` also matches
  const graphs = await dists_for_refund(don.id);
  if (graphs.length === 0) {
    return { status: "failed", reason: "not_distributed" };
  }

  const res = await process_refund(don.id, graphs, {
    form_id: don.form_id ?? null,
    program_id: don.program?.id ?? null,
    alert_from: r.alert_from,
    source: r.source === "dispute" ? "dispute" : "refund",
    source_ref: r.source_ref ?? r.notice.id,
  });

  const failed = res.failures.length;
  console.info(
    `${r.alert_from}: reversed ${r.donation_id}, dists: ${graphs.length}, failures: ${failed}, owed: ${res.owed_msgs.length}`
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
    has_loss: res.has_loss,
  };
}

/** part of the charge: each party's share recorded as owed, nothing reversed */
async function reverse_share(
  r: ChargeReversal,
  donation_id: string,
  f: number
): Promise<ReversalResult> {
  const res = await record_share({
    donation_id,
    f,
    of: r.share!.of,
    refunds: r.refunds,
    fee_dispute_usd: r.dispute_fee_usd ?? 0,
    source: r.source === "dispute" ? "dispute" : "refund",
    source_ref: r.source_ref ?? r.notice.id,
  });
  if (res.undistributed) return { status: "failed", reason: "not_distributed" };
  const { owed_msgs, pending } = res;
  const text = SHARE_NOTICE[r.source];
  // awaited: a lost notice fails the delivery, so the provider redelivers it,
  // which records nothing more. keyed on the event, so it posts once
  await enqueue(
    msg("fiat-notice", {
      id: r.notice.id,
      alert: {
        type: "NOTICE",
        from: `${r.alert_from}-${stage}`,
        title: pending.length > 0 ? text.pending : text.owed,
        body: [
          ...r.notice.lines,
          `${humanize(res.f * 100)}% of the charge taken back so far; the donation is not reversed.`,
          ...owed_msgs.map((m) => `owed: ${m}`),
          ...pending.map((m) => `not owed: ${m}`),
          ...(pending.length > 0 ? [text.action] : []),
        ].join("\n"),
      },
    })
  );
  return pending.length > 0
    ? { status: "partial_pending", owed_msgs }
    : { status: "partial_owed", owed_msgs };
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
  /** non-reversible items — refund proceeds; the npo or the referrer owes them back */
  warnings: PreviewLine[];
}

export interface ReversalPreview {
  /** one per settled dist; none means there is nothing to reverse yet */
  dists: DistPreview[];
}

/** what reversing `don` would do to each of its dists, writing nothing.
 * `sub_id` is the recurring gift the payment billed, if any */
export async function reversal_preview(
  don: IDonation,
  sub_id: string | null
): Promise<ReversalPreview> {
  const graphs = await dists_for_refund(don.id);

  const dists: DistPreview[] = [];
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
                ? "Recorded as owed"
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
    const p = plan.preview;
    dists.push({
      id: dist.id,
      npo_id: dist.to_id ?? 0,
      npo_name: dist.to_name ?? "",
      amount,
      net: dist.net ?? 0,
      refund_status: dist.refund_status,
      refund_error: dist.refund_error,
      owed: plan.amount.find((a) => "npo_id" in a.party)?.usd ?? 0,
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
  return { dists };
}
