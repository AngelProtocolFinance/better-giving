import { report_error } from "#/errors/report";
import type { Alert } from "@/discord";
import { stage } from "../env";
import { aws_monitor } from "../kit/discord";
import { db } from "../pg/db";
import type { DbOrTx } from "../pg/queries/helpers";
import { npo_balance_update } from "../pg/queries/npo";
import {
  payouts_in,
  payouts_move,
  pending_payouts_locked,
  settlement_put,
} from "../pg/queries/payout";
import { reverse_unfunded_payout_loss } from "../refund/unfunded";
import { NotFundedError, payout_total, transfer_ref } from "./transfer";

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
  | { status: "settled"; ref: string; total: number; transfer_id: string };

export interface ISettleNpo {
  id: number;
  name: string;
  /** resolved by the caller: the npo's own minimum or the platform default */
  payout_minimum: number;
}

/** `ref_key` names the recipient; the ref binds it with the claimed set and total */
export async function settle_npo_payouts(
  npo: ISettleNpo,
  payout_ids: string[],
  ref_key: string,
  pay: Pay
): Promise<SettleResult> {
  const claim = await db.transaction(async (tx) => {
    const locked = await pending_payouts_locked(tx, payout_ids);
    if (locked.length === 0) return { status: "none_pending" } as const;
    // wise moves cents: the quote, settlement and cash debit all take this one figure
    const total = payout_total(locked.map((p) => p.amount));
    if (total < npo.payout_minimum) {
      const minimum = npo.payout_minimum;
      return { status: "under_minimum", total, minimum } as const;
    }
    const ids = locked.map((p) => p.id);
    // stored with the claim: a run that dies past here leaves only the rows to reconcile by
    const ref = transfer_ref(ref_key, total, ids);
    await payouts_move(tx, ids, "pending", { type: "processing", ref });
    return { status: "claimed", payouts: locked, ids, total, ref } as const;
  });
  if (claim.status !== "claimed") return claim;
  const { payouts: claimed, ids, total, ref } = claim;

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
        released = await db.transaction((tx) => release(tx, ids));
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
      const { not_released, kept } = released;
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
        { liq: 0, lock: 0, lock_units: 0, cash: total },
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

interface IRelease {
  not_released: string[];
  /** refunded in flight and not reversed, so what the npo owes (or, for a
   * refund recorded before the owed ledger, its loss log) still counts a payout
   * the npo was never paid */
  kept: { id: string; reason: string; pre_ledger: boolean }[];
}

/**
 * back to pending, for a transfer that was never funded. one loss-refunded
 * while in flight is refunded as if it had been pending; each in its own
 * savepoint, so one that fails leaves the others and the release standing.
 */
async function release(tx: DbOrTx, ids: string[]): Promise<IRelease> {
  const released = await payouts_move(tx, ids, "processing", {
    type: "pending",
  });
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
  return { not_released, kept };
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
