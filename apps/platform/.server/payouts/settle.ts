import { createHash } from "node:crypto";
import { report_error } from "#/errors/report";
import type { Alert } from "@/discord";
import { stage } from "../env";
import { aws_monitor } from "../kit/discord";
import { db } from "../pg/db";
import { npo_balance_update } from "../pg/queries/npo";
import {
  payouts_in,
  payouts_move,
  pending_payouts_locked,
  settlement_put,
} from "../pg/queries/payout";

/**
 * wires the money: returns the transfer id once funding was accepted. throws
 * `NotFundedError` only when wise was never asked to fund or refused funding
 * outright; any other throw means the money may have moved.
 */
export type Pay = (ref: string, total: number) => Promise<number | string>;

/** `Pay` failed with no money moved */
export class NotFundedError extends Error {
  constructor(cause: unknown) {
    super("transfer not funded", { cause });
    this.name = "NotFundedError";
  }
}

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
    const total = locked.reduce((a, b) => a + b.amount, 0);
    if (total < npo.payout_minimum) {
      const minimum = npo.payout_minimum;
      return { status: "under_minimum", total, minimum } as const;
    }
    const ids = locked.map((p) => p.id);
    await payouts_move(tx, ids, "pending", { type: "processing" });
    return { status: "claimed", payouts: locked, ids, total } as const;
  });
  if (claim.status !== "claimed") return claim;
  const { payouts: claimed, ids, total } = claim;
  const ref = transfer_ref(ref_key, total, ids);

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
      let released: string[];
      try {
        released = await db.transaction((tx) =>
          payouts_move(tx, ids, "processing", { type: "pending" })
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
      // loss-refunded in flight: its loss log says the npo kept money it never got
      const not_released = ids.filter((id) => !released.includes(id));
      report_error(err.cause, {
        ...ctx,
        ...(not_released.length > 0 && { not_released }),
      });
      if (not_released.length > 0) {
        await alert({
          title: `refunded as a loss but never paid, npo:${npo.id}`,
          body: `these payouts were loss-refunded while their transfer was in flight, and the transfer failed before funding. the npo's cash still carries them and their loss log records a loss that did not happen: debit the cash or reverse the loss log. customerTransactionId ${ref}`,
          fields: [
            ...fields,
            { name: "not_released", value: not_released.join(", ") },
          ],
        });
      }
      return { status: "released", ref };
    }
    report_error(err, ctx);
    await alert({
      title: `funded status unknown for npo:${npo.id}`,
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
      body: `do not reset these payouts to pending or pay them again; wise transfer ${transfer_id} (customerTransactionId ${ref}) was funded. if the payouts are still processing, record the settlement by hand`,
      fields,
    });
    return { status: "unrecorded", ref, transfer_id };
  }
  if (unsettled.length > 0) {
    await alert({
      title: `paid payouts left processing unexpectedly, npo:${npo.id}`,
      body: `wise transfer ${transfer_id} (customerTransactionId ${ref}) paid these payouts and is recorded, but they had already moved out of processing by a path other than a loss refund, so they were not marked settled`,
      fields: [...fields, { name: "unsettled", value: unsettled.join(", ") }],
    });
  }
  return { status: "settled", ref, total, transfer_id };
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

// fixed namespace for the uuid v5 below; changing it re-keys every ref
const REF_NAMESPACE = Buffer.from("cb853edef275466b85c79409fa3f037a", "hex");

/**
 * uuid v5 of recipient + total + payout id set: wise's `customerTransactionId`
 * is its idempotency key, so only a retry of the same transfer to the same
 * account reuses it.
 */
function transfer_ref(ref_key: string, total: number, ids: string[]): string {
  const name = JSON.stringify([ref_key, total.toFixed(2), [...ids].sort()]);
  const b = createHash("sha1")
    .update(REF_NAMESPACE)
    .update(name)
    .digest()
    .subarray(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
