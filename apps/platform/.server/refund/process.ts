import { donation_match_refund_notif as dmr } from "emails";
import { emails } from "@/constants/common";
import { report_error } from "@/errors/report";
import { to_amount } from "@/helpers/email";
import { stage } from "../env";
import { fiat_monitor } from "../kit/discord";
import { db } from "../pg/db";
import {
  type DistRefundGraph,
  dist_refund_update,
  donation_has_refund_loss,
} from "../pg/queries/dist";
import { donation_get, donation_update } from "../pg/queries/donation";
import { void_match_event } from "../pg/queries/match";
import { nav_ltd } from "../pg/queries/nav";
import { npo_get } from "../pg/queries/npo";
import type { MatchEvent } from "../pg/schema/match";
import { apply_refund_plan } from "./apply";
import {
  calc_refund_plan,
  type RefundCtx,
  type RefundInputs,
  type RefundPlan,
} from "./plan";

export interface ProcessRefundCtx {
  form_id: string | null;
  program_id: string | null;
  /** discord alert sender identity, e.g. `refund-action-${stage}` */
  alert_from: string;
}

export interface RefundResult {
  failures: string[];
  loss_msgs: string[];
  has_loss: boolean;
  applied: number;
}

// dists already terminally processed (completed or settled-with-loss) are
// skipped defensively. failed dists are intentionally NOT skipped — they're
// the retry target. dists_for_refund already filters dist.status="settled",
// so completed/loss should never reach here in practice; the skip is defense
// against inconsistent rows.
const SKIP_STATUSES = new Set(["completed", "loss"]);

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
      fee_base: dist.fee_base ?? 0,
      fee_fsa: dist.fee_fsa ?? 0,
      fee_processing: dist.fee_processing ?? 0,
    },
    payout: g.payout ? { id: g.payout.id, type: g.payout.type ?? null } : null,
    commission: g.commission
      ? {
          donation_id: g.commission.donation_id,
          amount: g.commission.amount ?? 0,
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
  const loss_msgs: string[] = [];
  let applied = 0;

  for (const g of graphs) {
    if (g.dist.refund_status && SKIP_STATUSES.has(g.dist.refund_status)) {
      continue;
    }
    try {
      const plan = await load_refund_plan(g, {
        form_id: ctx.form_id,
        program_id: ctx.program_id,
        sub_id: null, // not used during apply; sub cancel is route-owned
        strict: true,
      });

      const loss = await db.transaction((tx) => apply_refund_plan(tx, plan));

      const status = plan.is_loss ? "loss" : "completed";
      await dist_refund_update(db, g.dist.id, { refund_status: status });
      applied += 1;

      if (loss) {
        loss_msgs.push(`npo ${g.dist.to_id}: $${loss.amount} — ${loss.reason}`);
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

  // factor in losses from prior partial runs — current loss_msgs only sees
  // dists processed this invocation; siblings already marked
  // refund_status="loss" from a prior attempt won't reappear.
  const has_loss =
    loss_msgs.length > 0 || (await donation_has_refund_loss(donation_id));

  // only finalize the donation status when every dist was applied. with
  // failures present the dists are in mixed states (some "completed",
  // some "failed") and the donation must stay reversible so admin can
  // retry once the failed dists are fixed. webhook path gets the same
  // semantics: a partial failure leaves the row in "settled" and a future
  // retry (manual or replayed event) can complete the refund.
  //
  // the status flip and the match void go together in one transaction because
  // a void that fails silently is worse than no void at all: every suppression
  // downstream keys off `voided_at`, so a missed stamp means the T+3d chase
  // still fires at a donor whose money already went home. the transaction makes
  // that failure loud — it rolls back, the donation stays "settled" with its
  // dists already "completed", which is exactly the mixed,
  // reversible-and-retryable state the paragraph above already documents. a
  // replayed `charge.refunded` skips the completed dists via SKIP_STATUSES and
  // retries the pair.
  //
  // one write site covers both refund entry points: the `charge.refunded`
  // webhook, and the admin refund action, which calls process_refund itself and
  // whose resulting webhook short-circuits before reaching here.
  if (failures.length === 0) {
    const status = has_loss ? "refunded_loss" : "refunded";
    const voided = await db.transaction(async (tx) => {
      await donation_update(tx, donation_id, { status });
      return void_match_event(tx, donation_id, status);
    });

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
  }

  // losses are finance-ops notices (not bugs) — keep discord. failures go to sentry inline at the throw site.
  if (loss_msgs.length > 0) {
    await fiat_monitor.send_alert({
      type: "NOTICE",
      from: `${ctx.alert_from}-${stage}`,
      title: "Refund Completed with Losses",
      body: `LOSSES:\n${loss_msgs.join("\n")}`,
    });
  }

  return { failures, loss_msgs, has_loss, applied };
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
