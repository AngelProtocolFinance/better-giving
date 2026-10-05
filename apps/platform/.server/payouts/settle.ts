import { sql } from "drizzle-orm";
import { report_error } from "#/errors/report";
import type { Alert } from "@/discord";
import { owed_deductions, stage } from "../env";
import { aws_monitor } from "../kit/discord";
import { db } from "../pg/db";
import type { DbOrTx } from "../pg/queries/helpers";
import { npo_balance_update } from "../pg/queries/npo";
import {
  outstanding_for_npo,
  recover_owed,
  repay_owed,
  unrecover_owed,
} from "../pg/queries/owed";
import {
  payouts_in,
  payouts_move,
  pending_payouts_locked,
  settlement_put,
} from "../pg/queries/payout";
import { reverse_unfunded_payout_loss } from "../refund/unfunded";
import { type IRecovery, type NetPlan, net_owed } from "./net-owed";
import {
  NotFundedError,
  payout_total,
  recovered_run_ref,
  transfer_ref,
} from "./transfer";

/**
 * wires the money: returns the transfer id once funding was accepted. throws
 * `NotFundedError` only when wise was never asked to fund or refused funding
 * outright; any other throw means the money may have moved.
 */
export type Pay = (ref: string, total: number) => Promise<number | string>;

export type SettleResult =
  | { status: "none_pending" }
  | { status: "under_minimum"; total: number; minimum: number }
  | { status: "released"; ref: string }
  | { status: "unreleased"; ref: string }
  | { status: "fund_unknown"; ref: string }
  | { status: "unrecorded"; ref: string; transfer_id: string }
  | { status: "settled"; ref: string; total: number; transfer_id: string }
  /** every payout went to what the npo owes: settled with no transfer */
  | { status: "recovered"; ref: string; total: number }
  | { status: "no_recipient"; total: number };

export interface ISettleNpo {
  id: number;
  name: string;
  /** resolved by the caller: the npo's own minimum or the platform default */
  payout_minimum: number;
}

/** `ref_key` names the recipient; the ref binds it with the claimed set and
 * total. null when the npo has none: only a run that sends nothing settles */
export async function settle_npo_payouts(
  npo: ISettleNpo,
  payout_ids: string[],
  ref_key: string | null,
  pay: Pay
): Promise<SettleResult> {
  const nets = owed_deductions;
  const claim = await db.transaction(async (tx) => {
    if (nets) await lock_npo_run(tx, npo.id);
    const locked = await pending_payouts_locked(tx, payout_ids);
    if (locked.length === 0) return { status: "none_pending" } as const;
    // wise moves cents: the minimum, quote and cash debit all start from this one figure
    const gross = payout_total(locked.map((p) => p.amount));
    const owed = nets ? await outstanding_for_npo(tx, npo.id) : [];
    const plan = net_owed(gross, owed, npo.payout_minimum);
    if (plan.status === "under_minimum") {
      const { net: total, minimum } = plan;
      return { status: "under_minimum", total, minimum } as const;
    }
    const ids = locked.map((p) => p.id);
    if (plan.status === "recover_only") {
      const ref = recovered_run_ref(npo.id, ids);
      await deduct(tx, npo.id, plan, ref);
      await settle_recovered(tx, npo.id, locked, gross, ref);
      return { status: "recovered", ref, total: gross } as const;
    }
    const total = plan.net;
    if (ref_key === null) return { status: "no_recipient", total } as const;
    // stored with the claim: a run that dies past here leaves only the rows to reconcile by
    const ref = transfer_ref(ref_key, total, ids);
    await deduct(tx, npo.id, plan, ref);
    await payouts_move(tx, ids, "pending", { type: "processing", ref });
    return {
      status: "claimed",
      payouts: locked,
      ids,
      gross,
      total,
      ref,
    } as const;
  });
  if (claim.status !== "claimed") return claim;
  const { payouts: claimed, ids, gross, total, ref } = claim;

  const fields = [
    { name: "npo", value: `${npo.id}: ${npo.name}` },
    { name: "amount", value: total.toString() },
    { name: "payout_ids", value: ids.join(", ") },
  ];

  let transfer_id: string;
  try {
    transfer_id = String(await pay(ref, total));
  } catch (err) {
    const ctx = { npo_id: npo.id, ref, payout_ids: ids };
    if (err instanceof NotFundedError) {
      let released: IRelease;
      try {
        released = await db.transaction((tx) =>
          release(tx, ids, nets ? { npo_id: npo.id, ref } : undefined)
        );
      } catch (release_err) {
        report_error(err.cause, ctx);
        report_error(release_err, ctx);
        await alert({
          title: `not funded, release failed for npo:${npo.id}`,
          body: `the transfer was not funded (${String(err.cause)}); these payouts are safe to reset to pending. customerTransactionId ${ref}`,
          fields,
        });
        return { status: "unreleased", ref };
      }
      const { not_released, kept, deductions_kept } = released;
      if (deductions_kept !== undefined) {
        await alert({
          title: `not funded, deductions not undone for npo:${npo.id}`,
          body: `the transfer was not funded and its payouts are back to pending, but what the run recovered from the npo's owed rows, or paid of what it is due back, could not be taken back (${String(deductions_kept)}): a row has moved on since, most often by a later run paying out a due-back. each entry under ref ${ref} on the npo's owed rows still counts money that never moved; reverse those by hand before the next run. customerTransactionId ${ref}`,
          fields,
        });
      }
      report_error(err.cause, {
        ...ctx,
        ...(not_released.length > 0 && { not_released }),
      });
      // ops undoes a refund from before the owed ledger another way
      for (const pre_ledger of [true, false]) {
        const payouts = kept.filter((k) => k.pre_ledger === pre_ledger);
        if (payouts.length === 0) continue;
        await alert({
          title: `refunded ${pre_ledger ? "as a loss" : "as owed"} but never paid, npo:${npo.id}`,
          body: pre_ledger
            ? `these payouts were loss-refunded while their transfer was in flight, and the transfer failed before funding. the loss could not be reversed automatically, so the npo's cash still carries them and their loss log records a loss that did not happen: debit the cash or reverse the loss log. customerTransactionId ${ref}`
            : `these payouts were refunded while their transfer was in flight, and the transfer failed before funding, so the npo was never paid them. the refund could not be redone as if they were pending, so the npo's cash still carries each one's cash share and the gift's owed row stays, still counting it: debit the npo's cash by each one's cash share, then credit that amount on the gift's owed row. customerTransactionId ${ref}`,
          fields: [
            ...fields,
            {
              name: "not_reversed",
              value: payouts.map((k) => `${k.id}: ${k.reason}`).join("\n"),
            },
          ],
        });
      }
      return { status: "released", ref };
    }
    report_error(err, ctx);
    await alert({
      title: `funding status unknown for npo:${npo.id}`,
      body: `do not reset these payouts to pending or pay them again; reconcile in Wise by customerTransactionId ${ref}`,
      fields,
    });
    return { status: "fund_unknown", ref };
  }

  const date = new Date().toISOString();
  let unsettled: string[];
  try {
    unsettled = await db.transaction(async (tx) => {
      // before the payouts: their settled_id references it
      await settlement_put(tx, {
        id: transfer_id,
        other_id: ref,
        npo_id: npo.id,
        date,
        amount: total,
        sources: claimed.map((p) => p.source_id),
        status: "",
      });
      const settled = await payouts_move(tx, ids, "processing", {
        type: "settled",
        settled_date: date,
        settled_id: transfer_id,
      });
      await npo_balance_update(
        tx,
        npo.id,
        { liq: 0, lock: 0, lock_units: 0, cash: gross },
        "dec"
      );
      // a loss refund may take a payout in flight; the npo keeps that money
      const moved_on = ids.filter((id) => !settled.includes(id));
      const loss_refunded = await payouts_in(tx, moved_on, "refunded_loss");
      return moved_on.filter((id) => !loss_refunded.includes(id));
    });
  } catch (err) {
    report_error(err, {
      npo_id: npo.id,
      ref,
      transfer_id,
      payout_ids: ids,
    });
    // the commit may have landed with its reply lost, so the alert says check first
    await alert({
      title: `funded, not recorded for npo:${npo.id}`,
      body: `do not reset these payouts to pending or pay them again; Wise transfer ${transfer_id} (customerTransactionId ${ref}) was funded. if the payouts are still processing, record the settlement by hand`,
      fields,
    });
    return { status: "unrecorded", ref, transfer_id };
  }
  if (unsettled.length > 0) {
    await alert({
      title: `paid but not marked settled, npo:${npo.id}`,
      body: `Wise transfer ${transfer_id} (customerTransactionId ${ref}) paid these payouts and is recorded, but they had already moved out of processing by a path other than a loss refund, so they were not marked settled. check each before the next run: one back in pending is paid again`,
      fields: [...fields, { name: "unsettled", value: unsettled.join(", ") }],
    });
  }
  return { status: "settled", ref, total, transfer_id };
}

/** each recovery and due-back payment in `plan`, as entries under the run's `ref` */
async function deduct(
  tx: DbOrTx,
  npo_id: number,
  plan: Exclude<NetPlan, { status: "under_minimum" }>,
  ref: string
) {
  const now = new Date().toISOString();
  const entry = (r: IRecovery) => ({
    donation_id: r.donation_id,
    party: { npo_id },
    usd: r.usd,
    reason: "grant_run" as const,
    ref,
    now,
  });
  for (const r of plan.recovered) await recover_owed(tx, entry(r));
  for (const r of plan.repaid) await repay_owed(tx, entry(r));
}

/** a settlement of $0 under the run's ref, no transfer behind it */
async function settle_recovered(
  tx: DbOrTx,
  npo_id: number,
  payouts: { id: string; source_id: string }[],
  gross: number,
  ref: string
) {
  const date = new Date().toISOString();
  await settlement_put(tx, {
    id: ref,
    other_id: null,
    npo_id,
    date,
    amount: 0,
    sources: payouts.map((p) => p.source_id),
    status: "",
  });
  const ids = payouts.map((p) => p.id);
  await payouts_move(tx, ids, "pending", {
    type: "settled",
    settled_date: date,
    settled_id: ref,
  });
  await npo_balance_update(
    tx,
    npo_id,
    { liq: 0, lock: 0, lock_units: 0, cash: gross },
    "dec"
  );
}

interface IRelease {
  not_released: string[];
  /** why the claim's deductions could not be undone, when they could not */
  deductions_kept?: unknown;
  /** refunded in flight and not reversed, so what the npo owes (or, for a
   * refund recorded before the owed ledger, its loss log) still counts a payout
   * the npo was never paid */
  kept: { id: string; reason: string; pre_ledger: boolean }[];
}

/**
 * back to pending, for a transfer that was never funded. one loss-refunded
 * while in flight is refunded as if it had been pending; each in its own
 * savepoint, so one that fails leaves the others and the release standing.
 * `run` names a claim that netted what the npo owes: its deductions are
 * undone with it
 */
async function release(
  tx: DbOrTx,
  ids: string[],
  run?: { npo_id: number; ref: string }
): Promise<IRelease> {
  if (run) await lock_npo_run(tx, run.npo_id);
  const released = await payouts_move(tx, ids, "processing", {
    type: "pending",
  });
  let deductions_kept: unknown;
  if (run) {
    const now = new Date().toISOString();
    try {
      await tx.transaction((sp) => unrecover_owed(sp, { ...run, now }));
    } catch (err) {
      report_error(err, run);
      deductions_kept = err;
    }
  }
  const not_released = ids.filter((id) => !released.includes(id));
  const kept: IRelease["kept"] = [];
  for (const id of await payouts_in(tx, not_released, "refunded_loss")) {
    try {
      const r = await tx.transaction((sp) =>
        reverse_unfunded_payout_loss(sp, id)
      );
      if (r.status === "kept") {
        kept.push({ id, reason: r.reason, pre_ledger: r.pre_ledger === true });
      }
    } catch (err) {
      report_error(err, { payout_id: id });
      kept.push({ id, reason: String(err), pre_ledger: false });
    }
  }
  return { not_released, kept, deductions_kept };
}

/** one netting run per npo at a time: a claim and an unfunded release take
 * this before any payout or owed row, so they queue instead of each holding a
 * row the other waits on */
async function lock_npo_run(tx: DbOrTx, npo_id: number) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`grant_run:npo:${npo_id}`}, 0))`
  );
}

/** an alert that fails to send is reported, never thrown past the money */
async function alert(a: Omit<Alert, "from" | "type">) {
  try {
    await aws_monitor.send_alert({
      ...a,
      type: "ERROR",
      from: `grants-processor:${stage}`,
    });
  } catch (err) {
    report_error(err, { alert: a.title });
  }
}
