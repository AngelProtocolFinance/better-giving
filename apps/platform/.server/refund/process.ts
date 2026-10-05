import { donation_match_refund_notif as dmr } from "emails";
import { report_error } from "#/errors/report";
import { emails } from "@/constants/common";
import { humanize } from "@/helpers/decimal";
import { to_amount } from "@/helpers/email";
import { nav_log_date } from "@/nav";
import { base_url, stage } from "../env";
import { fiat_monitor } from "../kit/discord";
import { db } from "../pg/db";
import {
  type DistRefundGraph,
  dist_refund_state_locked,
  dist_refund_update,
  dists_for_refund,
  dists_settled_of,
} from "../pg/queries/dist";
import {
  donation_get,
  donation_lock,
  donation_update,
} from "../pg/queries/donation";
import type { DbOrTx } from "../pg/queries/helpers";
import { void_match_event } from "../pg/queries/match";
import { nav_ltd } from "../pg/queries/nav";
import { npo_get } from "../pg/queries/npo";
import { credit_owed, owed_for_party, owed_total } from "../pg/queries/owed";
import type { MatchEvent } from "../pg/schema/match";
import { apply_refund_plan, type OwedSource, StalePayoutError } from "./apply";
import { donation_refund_status } from "./donation-status";
import {
  calc_refund_plan,
  type RefundCtx,
  type RefundInputs,
  type RefundPlan,
  referrer_of,
} from "./plan";

export interface ProcessRefundCtx extends OwedSource {
  form_id: string | null;
  program_id: string | null;
  /** discord alert sender identity, e.g. `refund-action-${stage}` */
  alert_from: string;
}

export interface RefundResult {
  failures: string[];
  /** what each party now owes back, one line per row */
  owed_msgs: string[];
  has_loss: boolean;
  applied: number;
}

// dists already terminally processed (completed or settled-with-loss) are
// skipped defensively. failed dists are intentionally NOT skipped — they're
// the retry target. dists_for_refund already filters dist.status="settled",
// so on a fresh graph completed/loss never reach here; the pre-check is
// defense against inconsistent rows.
const SKIP_STATUSES = new Set(["completed", "loss"]);

const MAX_STRAGGLER_SWEEPS = 3;

// the authoritative check, run on the row read under its lock inside the apply
// transaction. the graph a run was handed can be stale — a concurrent run on
// the same donation may have reversed the dist since.
function dist_is_reversed(d: { status: string; refund_status: string | null }) {
  return (
    d.status !== "settled" ||
    (!!d.refund_status && SKIP_STATUSES.has(d.refund_status))
  );
}

/** whether this dispute's open recorded the party's row: what the npo owes
 * from it was taken then, so the reversal's own take comes off it */
async function recorded_at_open(
  tx: DbOrTx,
  donation_id: string,
  party: { npo_id: number },
  src: OwedSource
): Promise<boolean> {
  if (src.source !== "dispute") return false;
  const row = await owed_for_party(donation_id, party, tx);
  return row?.source === "dispute" && row.source_ref === src.source_ref;
}

/** usd the plan takes back from the npo's balances and pending payout */
const taken_from_npo = (plan: RefundPlan): number =>
  plan.effects.reduce(
    (sum, e) =>
      e.kind === "balance_update"
        ? sum + e.deltas.liq + e.deltas.lock + e.deltas.cash
        : sum,
    0
  );

/** project a rich DistRefundGraph + fetched npo/nav into the pure calc inputs */
function project_inputs(
  g: DistRefundGraph,
  bal: { liq: number; lock_units: number; cash: number },
  nav: { price: number } | null,
  sub_id: string | null
): RefundInputs {
  const { dist } = g;
  return {
    dist: {
      id: dist.id,
      donation_id: dist.donation_id,
      to_id: dist.to_id ?? 0,
      to_name: dist.to_name ?? "",
      alloc: dist.alloc ?? { liq: 0, lock: 0, cash: 0 },
      net: dist.net ?? 0,
      amount: dist.amount ?? 0,
      amount_usd: dist.amount_usd,
      fee_base: dist.fee_base ?? 0,
      fee_fsa: dist.fee_fsa ?? 0,
      fee_processing: dist.fee_processing ?? 0,
      fee_allowance: dist.fee_allowance ?? 0,
    },
    payout: g.payout ? { id: g.payout.id, type: g.payout.type ?? null } : null,
    commission: g.commission
      ? {
          donation_id: g.commission.donation_id,
          amount: g.commission.amount ?? 0,
          status: g.commission.status,
          referrer: referrer_of(g.commission),
        }
      : null,
    rev_log_ids: g.rev_logs.map((rl) => rl.id),
    bal,
    nav,
    sub_id,
  };
}

/**
 * fetch npo + nav and produce the plan for one dist (calc only — no writes).
 * strict=true throws if the npo row is missing — used by the apply path so a
 * missing npo surfaces as a dist-failure (sentry) rather than a spurious loss.
 * loader callers pass strict=false to preserve preview rendering when an npo
 * row is unexpectedly absent.
 */
export async function load_refund_plan(
  g: DistRefundGraph,
  ctx: {
    form_id: string | null;
    program_id: string | null;
    sub_id: string | null;
    strict: boolean;
  }
): Promise<RefundPlan> {
  const npo_id = g.dist.to_id ?? 0;
  const alloc = g.dist.alloc ?? { liq: 0, lock: 0, cash: 0 };
  const net = g.dist.net ?? 0;
  const needs_nav = (alloc.lock / 100) * net > 0;

  const [npo_item, nav] = await Promise.all([
    npo_get(npo_id),
    needs_nav ? nav_ltd() : undefined,
  ]);
  if (ctx.strict && !npo_item) {
    throw new Error(`npo:${npo_id} not found`);
  }
  const bal = {
    liq: npo_item?.liq ?? 0,
    lock_units: npo_item?.lock_units ?? 0,
    cash: npo_item?.cash ?? 0,
  };

  const inputs = project_inputs(
    g,
    bal,
    nav ? { price: nav.price } : null,
    ctx.sub_id
  );
  const plan_ctx: RefundCtx = {
    now: new Date().toISOString(),
    nav_date: nav_log_date(),
    form_id: ctx.form_id,
    program_id: ctx.program_id,
  };
  return calc_refund_plan(inputs, plan_ctx);
}

export async function process_refund(
  donation_id: string,
  graphs: DistRefundGraph[],
  ctx: ProcessRefundCtx
): Promise<RefundResult> {
  const failures: string[] = [];
  const owed_msgs: string[] = [];
  const src: OwedSource = { source: ctx.source, source_ref: ctx.source_ref };
  let applied = 0;

  async function apply_dist(g: DistRefundGraph) {
    const plan = await load_refund_plan(g, {
      form_id: ctx.form_id,
      program_id: ctx.program_id,
      sub_id: null, // not used during apply; reverse_charge ends the subscription
      strict: true,
    });

    return db.transaction(async (tx) => {
      const cur = await dist_refund_state_locked(tx, g.dist.id);
      if (!cur || dist_is_reversed(cur)) return { skipped: true } as const;
      const party = { npo_id: g.dist.to_id ?? 0 };
      // read before apply, whose loss path records a row of its own
      const opened = await recorded_at_open(tx, donation_id, party, src);
      const applied = await apply_refund_plan(tx, plan, src);
      const taken = taken_from_npo(plan);
      if (opened && taken > 0) {
        await credit_owed(tx, {
          donation_id,
          party,
          usd: taken,
          reason: "dispute_reversed",
          ref: `${src.source_ref}:${g.dist.id}`,
          now: new Date().toISOString(),
        });
      }
      await dist_refund_update(tx, g.dist.id, {
        refund_status: plan.is_loss ? "loss" : "completed",
      });
      return {
        skipped: false,
        ...applied,
        reasons: plan.loss_reasons,
      } as const;
    });
  }

  async function reverse(g: DistRefundGraph) {
    if (g.dist.refund_status && SKIP_STATUSES.has(g.dist.refund_status)) {
      return;
    }
    try {
      // the grants cron claimed or settled the payout after `g` was read: a
      // plan drawn once more from a fresh graph sees it and takes the loss path
      const res = await apply_dist(g).catch(async (err) => {
        if (!(err instanceof StalePayoutError)) throw err;
        const fresh = (await dists_for_refund(donation_id)).find(
          (x) => x.dist.id === g.dist.id
        );
        // gone from the settled set: a concurrent run reversed it
        return fresh ? apply_dist(fresh) : ({ skipped: true } as const);
      });
      if (res.skipped) return;
      applied += 1;

      const { owed, commission_in_flight: c } = res;
      for (const o of owed) {
        const usd = owed_total(o);
        if (o.npo_id !== null) {
          owed_msgs.push(
            `$${humanize(usd)} recorded as owed by ${g.dist.to_name ?? "its npo"} (npo ${g.dist.to_id}), to recover from its future grants — ${res.reasons.join("; ")}`
          );
          continue;
        }
        const in_flight = c
          ? `. claimed by the Wise transfer with customerTransactionId ${c.ref}, so owed only if that transfer pays: if it goes unfunded, the commission run credits it back when it catches that, otherwise credit it on Amounts owed (/platform/owed)`
          : "";
        owed_msgs.push(
          `$${humanize(g.commission?.amount ?? 0)} commission ${g.dist.id} recorded as owed by referrer ${o.referrer_user ?? o.referrer_npo}, to recover from its next commission; the gift's row for that referrer totals $${humanize(usd)}${in_flight}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await dist_refund_update(db, g.dist.id, {
        refund_status: "failed",
        refund_error: msg,
      }).catch((e) => report_error(e, { dist_id: g.dist.id }));
      failures.push(`dist ${g.dist.id}: ${msg}`);
      report_error(err, { dist_id: g.dist.id, donation_id });
    }
  }

  for (const g of graphs) await reverse(g);

  // only finalize the donation status when every dist was applied. with
  // failures present the dists are in mixed states (some "completed",
  // some "failed") and the donation stays "settled", so a later run can finish
  // it: the admin retrying, or stripe redelivering the webhook that reversed
  // the full refund (`charge.refunded`, or `refund.updated` for a refund that
  // was pending), whose handler fails the delivery until this completes.
  //
  // the status flip and the match void go together in one transaction because
  // a void that fails silently is worse than no void at all: every suppression
  // downstream keys off `voided_at`, so a missed stamp means the T+3d chase
  // still fires at a donor whose money already went home. the transaction makes
  // that failure loud — it rolls back, the donation stays "settled" with its
  // dists already "completed", which is exactly the mixed,
  // reversible-and-retryable state the paragraph above already documents. a
  // replayed webhook skips the completed dists via SKIP_STATUSES and
  // retries the pair.
  //
  // one write site covers every refund entry point: the `charge.refunded` and
  // `refund.updated` webhooks, and the admin refund action, whose own stripe
  // refund fires them too. so several can run on one donation at once; each
  // dist is reversed once under its row lock in apply_dist, and the flip once
  // under the donation lock below.
  //
  // `graphs` is a snapshot, and settle_npo can commit a dist after it was taken.
  // so the flip first locks the donation row: that waits out a settle_npo
  // holding it `for share` mid-write, and makes any later one wait for the flip
  // and then skip. a dist still unreversed under that lock is swept and the flip
  // retried; one still there after the last sweep is a failure, leaving the
  // donation "settled" and retryable like any other.
  //
  // the status is read from the dists under that lock, never from this run's
  // results: prior partial runs' losses count, and a loss the grants cron
  // reversed since (`reverse_unfunded_payout_loss`) doesn't.
  let final: "refunded" | "refunded_loss" | undefined;
  for (let round = 0; failures.length === 0; round++) {
    const fin = await db.transaction(async (tx) => {
      await donation_lock(tx, donation_id);
      const pending = await dists_settled_of(tx, donation_id);
      if (pending.some((d) => !dist_is_reversed(d))) {
        return { flipped: false } as const;
      }
      const status = await donation_refund_status(tx, donation_id);
      await donation_update(tx, donation_id, { status });
      const voided = await void_match_event(tx, donation_id, status);
      return { flipped: true, status, voided } as const;
    });

    if (fin.flipped) {
      const { status, voided } = fin;
      final = status;
      // deliberately after the commit, never inside it: a send from within the
      // transaction either holds the row locks across a provider round-trip or
      // announces a void that then rolls back. the whole thing is caught, because
      // by here the money is already back — a heads-up that failed to send is a
      // missing notice, not a failed refund, and surfacing it as one would send an
      // admin to retry dists that are already reversed.
      if (voided?.submitted_at) {
        try {
          await notify_filed_claim_refunded(voided, status);
        } catch (err) {
          report_error(err, { donation_id, event_id: voided.id });
        }
      }
      break;
    }

    if (round === MAX_STRAGGLER_SWEEPS) {
      const msg = `donation ${donation_id}: dists still settled after ${MAX_STRAGGLER_SWEEPS} sweeps`;
      failures.push(msg);
      report_error(new Error(msg), { donation_id });
      break;
    }
    for (const g of await dists_for_refund(donation_id)) await reverse(g);
  }

  // owed amounts are finance-ops notices (not bugs) — keep discord. failures go to sentry inline at the throw site.
  if (owed_msgs.length > 0) {
    await fiat_monitor.send_alert({
      type: "NOTICE",
      from: `${ctx.alert_from}-${stage}`,
      title: "Refund Recorded as Owed",
      body: ["OWED:", ...owed_msgs].join("\n"),
    });
  }

  const has_loss =
    (final ?? (await donation_refund_status(db, donation_id))) ===
    "refunded_loss";
  return { failures, owed_msgs, has_loss, applied };
}

/**
 * tell the team a refund landed on a claim the donor had already filed.
 *
 * internal, and only internal. the claim names Better Giving, so the employer's
 * verification and any payment come here — the beneficiary has nothing to
 * answer, and the donor asked for their own money back, which is not something
 * to write to them about. what is left is ours: a claim that may still be open
 * against a donation that no longer exists.
 *
 * best-effort by construction. every read here is a second round-trip taken
 * after the refund has committed, so a missing donation row or a refused send
 * costs a notice and nothing else.
 */
async function notify_filed_claim_refunded(
  ev: MatchEvent,
  reason: "refunded" | "refunded_loss"
) {
  const don = await donation_get(ev.donation_id);
  if (!don) return;

  const { node, subject } = dmr.template({
    to_name: don.to_name,
    donor_name: don.from_name || "A donor",
    donor_email: don.from_email,
    // the donor's own input, unresolved — the same string every other surface
    // in this workflow echoes back
    employer_name: don.from_company_name || "their employer",
    donation: {
      id: don.id,
      amount: to_amount(
        don.amount.base,
        don.amount.base / don.upusd,
        don.currency
      ),
    },
    // both fallbacks satisfy nullable columns rather than paths that run: the
    // caller only gets here when `submitted_at` is set, and the row came back
    // from the same statement that stamped `voided_at`.
    filed_at: ev.submitted_at ?? ev.created_at,
    refunded_at: ev.voided_at ?? new Date().toISOString(),
    void_reason: reason,
    base_url,
  });

  // imported here rather than at the top: `../email` pulls in nodemailer, which
  // cannot be evaluated outside node, and this module is reached statically by
  // the refund route — a top-level import would make every consumer of that
  // route mock the mailer just to load it.
  const { send_email } = await import("../email");
  const res = await send_email({ node, subject, to: [emails.hi] });

  // send_email swallows provider errors into its return, so a refusal is
  // reported here or it is lost entirely
  if (!res.data) report_error(res.error, { donation_id: don.id });
}
