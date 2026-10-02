import { and, eq, inArray } from "drizzle-orm";
import { report_error } from "#/errors/report";
import { nav_log_date } from "@/nav";
import { dist_refund_update } from "../pg/queries/dist";
import { donation_lock, donation_update } from "../pg/queries/donation";
import type { DbOrTx } from "../pg/queries/helpers";
import { npo_balance_update, npo_get_locked } from "../pg/queries/npo";
import { payouts_move } from "../pg/queries/payout";
import { dists } from "../pg/schema/dist";
import { donations } from "../pg/schema/donation";
import { donation_match_events } from "../pg/schema/match";
import { payouts } from "../pg/schema/payout";
import { referrer_commissions } from "../pg/schema/referrer";
import { loss_logs, rev_logs } from "../pg/schema/revenue";
import { apply_refund_plan, type IAppliedRefund } from "./apply";
import { donation_refund_status } from "./donation-status";
import { calc_refund_plan, loss_figures_off, type RefundEffect } from "./plan";

export type UnfundedLossReversal =
  | {
      status: "reversed";
      /** its commission was claimed by a referrer transfer, so it went refunded_loss */
      commission_in_flight?: IAppliedRefund["commission_in_flight"];
    }
  /** a savings/investment shortfall is still the loss: the payout is cancelled,
   * its cash taken back and the loss cut by it, as with the payout pending */
  | { status: "loss_reduced" }
  /** nothing written: the pending-payout refund can't be reproduced exactly */
  | { status: "kept"; reason: string };

// what the loss path skipped or wrote with the loss status. form/program
// decrements and the message delete ran the same on both paths.
const LOSS_PATH_DIFFERS: ReadonlySet<RefundEffect["kind"]> = new Set([
  "balance_update",
  "bal_tx_put",
  "nav_log",
  "rev_log_status",
  "commission_status",
]);

/**
 * a refund that took payout `payout_id` as a loss while its transfer was in
 * flight, whose transfer then went unfunded: the npo was never paid, so this
 * writes in `tx` what the refund would have written had the payout still been
 * pending. a loss from the payout alone becomes `calc_refund_plan`'s non-loss
 * branch; one from a savings/investment shortfall stays, cut by the cash share.
 */
export async function reverse_unfunded_payout_loss(
  tx: DbOrTx,
  payout_id: string
): Promise<UnfundedLossReversal> {
  // dist, payout, npo: the order the refund locks them in
  const [dist] = await tx
    .select()
    .from(dists)
    .where(
      inArray(
        dists.id,
        tx
          .select({ id: payouts.source_id })
          .from(payouts)
          .where(eq(payouts.id, payout_id))
      )
    )
    .for("update");
  if (dist?.refund_status !== "loss") {
    return { status: "kept", reason: "its dist is not a loss refund" };
  }
  const losses = await tx
    .select()
    .from(loss_logs)
    .where(eq(loss_logs.dist_id, dist.id));
  const [loss] = losses;
  if (!loss || losses.length > 1) {
    const reason = `dist ${dist.id} has ${losses.length} loss logs, expected 1`;
    return { status: "kept", reason };
  }
  const alloc = dist.alloc ?? { liq: 0, lock: 0, cash: 0 };

  // the plan lists the payout reason last, so any other reason heads the type
  const shortfall_stands = loss.type !== "payout";
  if (!shortfall_stands && alloc.lock > 0) {
    // the units it would have redeemed were priced at refund time, which nothing records
    const reason =
      "part of the dist was invested: the nav price at refund time is not recorded";
    return { status: "kept", reason };
  }

  const [still_loss] = await tx
    .select({ id: payouts.id })
    .from(payouts)
    .where(and(eq(payouts.id, payout_id), eq(payouts.type, "refunded_loss")))
    .for("update");
  if (!still_loss) {
    return { status: "kept", reason: "payout is no longer refunded_loss" };
  }
  const to_id = dist.to_id ?? 0;
  const npo = await npo_get_locked(tx, to_id);
  if (!npo) return { status: "kept", reason: `npo:${to_id} not found` };
  if (shortfall_stands) {
    // `calc_refund_plan`'s pending-payout rule, against the loss it already logged
    const cash = ((alloc.cash ?? 0) / 100) * (dist.net ?? 0);
    const reduced = {
      amount: loss.amount - cash,
      npo_amount: loss.npo_amount - cash,
      reason: loss.reason
        .split("; ")
        .filter((r) => !r.startsWith("payout "))
        .join("; "),
    };
    const off = loss_figures_off(reduced);
    if (off) report_error(new Error(off), { loss_id: loss.id, payout_id });
    await payouts_move(tx, [payout_id], "refunded_loss", { type: "refunded" });
    await npo_balance_update(
      tx,
      to_id,
      { liq: 0, lock: 0, lock_units: 0, cash },
      "dec"
    );
    await tx.update(loss_logs).set(reduced).where(eq(loss_logs.id, loss.id));
    return { status: "loss_reduced" };
  }
  const [rls, [comm]] = await Promise.all([
    tx
      .select({ id: rev_logs.id })
      .from(rev_logs)
      .where(eq(rev_logs.donation_id, dist.id)),
    tx
      .select({
        donation_id: referrer_commissions.donation_id,
        amount: referrer_commissions.amount,
        status: referrer_commissions.status,
      })
      .from(referrer_commissions)
      .where(eq(referrer_commissions.donation_id, dist.id)),
  ]);

  const now = new Date().toISOString();
  const plan = calc_refund_plan(
    {
      dist: {
        id: dist.id,
        donation_id: dist.donation_id,
        to_id,
        to_name: dist.to_name ?? "",
        alloc,
        net: dist.net ?? 0,
        amount: dist.amount ?? 0,
        amount_usd: dist.amount_usd,
        fee_base: dist.fee_base ?? 0,
        fee_fsa: dist.fee_fsa ?? 0,
        fee_processing: dist.fee_processing ?? 0,
        fee_allowance: dist.fee_allowance ?? 0,
      },
      payout: { id: payout_id, type: "pending" },
      commission: comm ?? null,
      rev_log_ids: rls.map((r) => r.id),
      bal: {
        liq: npo.liq ?? 0,
        lock_units: npo.lock_units ?? 0,
        cash: npo.cash ?? 0,
      },
      nav: null,
      sub_id: null,
    },
    { now, nav_date: nav_log_date(), form_id: null, program_id: null }
  );
  if (plan.is_loss) {
    const reason = `a refund now would be a loss too: ${plan.loss_reasons.join("; ")}`;
    return { status: "kept", reason };
  }

  await payouts_move(tx, [payout_id], "refunded_loss", { type: "refunded" });
  const { commission_in_flight } = await apply_refund_plan(tx, {
    ...plan,
    effects: plan.effects.filter((e) => LOSS_PATH_DIFFERS.has(e.kind)),
  });
  await tx.delete(loss_logs).where(eq(loss_logs.id, loss.id));
  await dist_refund_update(tx, dist.id, { refund_status: "completed" });
  await donation_status_recompute(tx, dist.donation_id, now);
  return { status: "reversed", commission_in_flight };
}

/**
 * the refund's finalize flips a donation to `refunded_loss` when any dist is a
 * loss. one it already flipped goes back to `refunded` with its match void once
 * no loss dist is left; one not yet flipped is left to that finalize.
 */
async function donation_status_recompute(
  tx: DbOrTx,
  donation_id: string,
  now: string
) {
  await donation_lock(tx, donation_id);
  const [don] = await tx
    .select({ status: donations.status })
    .from(donations)
    .where(eq(donations.id, donation_id));
  if (don?.status !== "refunded_loss") return;
  if ((await donation_refund_status(tx, donation_id)) === "refunded_loss") {
    return;
  }
  await donation_update(tx, donation_id, { status: "refunded" });
  await tx
    .update(donation_match_events)
    .set({ void_reason: "refunded", updated_at: now })
    .where(
      and(
        eq(donation_match_events.donation_id, donation_id),
        eq(donation_match_events.void_reason, "refunded_loss")
      )
    );
}
