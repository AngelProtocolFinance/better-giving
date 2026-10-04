import { randomUUID } from "node:crypto";
import { report_error } from "#/errors/report";
import type { Alert } from "@/discord";
import type { IPayout } from "@/referrals";
import { stage } from "../env";
import { aws_monitor } from "../kit/discord";
import { db } from "../pg/db";
import {
  commissions_claim,
  commissions_mark_paid,
  commissions_release,
  referrer_payout_put,
} from "../pg/queries/referrer";
import {
  CREDIT_BY_HAND,
  credit_unfunded_commissions,
  refunded_in_flight_lines,
} from "../refund/commission";
import type { Pay } from "./settle";
import { NotFundedError, payout_total, transfer_ref } from "./transfer";

export interface ISettleReferrer {
  /** referral code, or the npo's `NPO-` referral id */
  id: string;
  /** wise recipient account id */
  pay_id: number;
  pay_min: number;
}

export type CommissionSettleResult =
  | { status: "none_pending" }
  | { status: "under_minimum"; total: number; minimum: number }
  | { status: "released"; ref: string }
  | { status: "unreleased"; ref: string }
  | { status: "fund_unknown"; ref: string }
  | { status: "unrecorded"; ref: string; transfer_id: string }
  | { status: "paid"; ref: string; total: number; transfer_id: string };

class UnderMinimum extends Error {
  constructor(readonly total: number) {
    super("under minimum");
  }
}

/**
 * pays a referrer every commission still pending, as `settle_npo_payouts`
 * pays grants: claims them (pending → processing, ref stored) before wise is
 * asked, so a retry or a later run never takes a claimed commission into a
 * second transfer. a
 * transfer that moved no money releases the claim; any other failure leaves it
 * processing for a manual reconcile by ref.
 */
export async function settle_referrer_commissions(
  referrer: ISettleReferrer,
  pay: Pay
): Promise<CommissionSettleResult> {
  let claim: Awaited<ReturnType<typeof commissions_claim>>;
  try {
    claim = await commissions_claim(db, referrer.id, (pending) => {
      const total = payout_total(pending.map((c) => c.amount));
      // thrown, so the claim's tx rolls back and nothing is claimed
      if (total < referrer.pay_min) throw new UnderMinimum(total);
      return transfer_ref(
        `referrer-commission:${referrer.pay_id}`,
        total,
        pending.map((c) => c.donation_id)
      );
    });
  } catch (err) {
    if (!(err instanceof UnderMinimum)) throw err;
    return {
      status: "under_minimum",
      total: err.total,
      minimum: referrer.pay_min,
    };
  }
  if (!claim) return { status: "none_pending" };

  const { ref, commissions } = claim;
  const ids = commissions.map((c) => c.donation_id);
  const total = payout_total(commissions.map((c) => c.amount));
  const fields = [
    { name: "referrer", value: referrer.id },
    { name: "amount", value: total.toString() },
    { name: "donation_ids", value: ids.join(", ") },
  ];
  const ctx = { referrer: referrer.id, ref, donation_ids: ids };

  let transfer_id: string;
  try {
    transfer_id = String(await pay(ref, total));
  } catch (err) {
    await error_row(referrer.id, total);
    if (err instanceof NotFundedError) {
      report_error(err.cause, ctx);
      let not_released: string[];
      try {
        // one transaction: a run dying between the two would leave the claim
        // released, so no stuck-claim alert, with the referrer rows uncredited
        not_released = await db.transaction(async (tx) => {
          const released = (await commissions_release(tx, ref)).map(
            (c) => c.donation_id
          );
          const refunded = ids.filter((id) => !released.includes(id));
          if (refunded.length > 0) await credit_unfunded_commissions(tx, ref);
          return refunded;
        });
      } catch (release_err) {
        report_error(release_err, ctx);
        // unfunded either way, so the referrer rows are owed nothing for it
        const credit = await db
          .transaction((tx) => credit_unfunded_commissions(tx, ref))
          .then(
            () =>
              "any refunded while it was in flight have what their referrer owes for them credited back",
            async (credit_err) => {
              report_error(credit_err, ctx);
              const lines = await refunded_in_flight_lines([ref]).catch((e) => {
                report_error(e, ctx);
                return [];
              });
              return [
                `crediting back what the referrer owes for any refunded while it was in flight failed: ${CREDIT_BY_HAND}`,
                ...lines,
              ].join("\n");
            }
          );
        await alert({
          title: `commission not funded, release failed for ${referrer.id}`,
          body: `the transfer was not funded (${String(err.cause)}); these commissions are safe to reset to pending. ${credit}. customerTransactionId ${ref}`,
          fields,
        });
        return { status: "unreleased", ref };
      }
      if (not_released.length > 0) {
        await alert({
          title: `commission refunded in flight, not funded, ${referrer.id}`,
          body: `these commissions were refunded while their transfer was in flight, and recorded as owed by the referrer; the transfer then failed before funding, so the referrer was never paid them, and what the referrer owes for them is credited back. customerTransactionId ${ref}`,
          fields: [
            ...fields,
            { name: "not_released", value: not_released.join(", ") },
          ],
        });
      }
      return { status: "released", ref };
    }
    report_error(err, ctx);
    const in_flight = await refunded_in_flight_lines([ref]).catch((e) => {
      report_error(e, ctx);
      return [];
    });
    await alert({
      title: `commission funding status unknown for ${referrer.id}`,
      body: [
        `do not reset these commissions to pending or pay them again; reconcile in Wise by customerTransactionId ${ref}`,
        ...(in_flight.length > 0
          ? [
              `refunded while the transfer held them, so recorded as owed by the referrer: once the transfer is confirmed unfunded, ${CREDIT_BY_HAND}`,
              ...in_flight,
            ]
          : []),
      ].join("\n"),
      fields,
    });
    return { status: "fund_unknown", ref };
  }

  let paid: string[];
  try {
    paid = await db.transaction(async (tx) => {
      const moved = await commissions_mark_paid(tx, ref);
      const payout: IPayout = {
        // the ref: one transfer, one row, found by its customerTransactionId
        id: ref,
        amount: total,
        date: new Date().toISOString(),
        transfer_id: +transfer_id,
        ...(referrer.id.startsWith("NPO-")
          ? { referrer_npo: referrer.id }
          : { referrer_user: referrer.id }),
      };
      await referrer_payout_put(tx, payout);
      return moved.map((c) => c.donation_id);
    });
  } catch (err) {
    report_error(err, { ...ctx, transfer_id });
    // the commit may have landed with its reply lost, so the alert says check first
    await alert({
      title: `commission funded, not recorded for ${referrer.id}`,
      body: `do not reset these commissions to pending or pay them again; Wise transfer ${transfer_id} (customerTransactionId ${ref}) was funded. if they are still processing, mark them paid by hand`,
      fields,
    });
    return { status: "unrecorded", ref, transfer_id };
  }
  const unpaid = ids.filter((id) => !paid.includes(id));
  if (unpaid.length > 0) {
    await alert({
      title: `commission paid but refunded in flight, ${referrer.id}`,
      body: `Wise transfer ${transfer_id} (customerTransactionId ${ref}) paid these commissions, but they were refunded while it was in flight: each is recorded as owed by the referrer, recovered from its next commission`,
      fields: [...fields, { name: "refunded", value: unpaid.join(", ") }],
    });
  }
  return { status: "paid", ref, total, transfer_id };
}

/** the failed attempt, shown in the referrer's payout history; never thrown past the money */
async function error_row(referrer: string, amount: number) {
  try {
    await referrer_payout_put(db, {
      id: randomUUID(),
      amount,
      date: new Date().toISOString(),
      error: "Failed to process commission",
      ...(referrer.startsWith("NPO-")
        ? { referrer_npo: referrer }
        : { referrer_user: referrer }),
    });
  } catch (err) {
    report_error(err, { referrer });
  }
}

/** an alert that fails to send is reported, never thrown past the money */
async function alert(a: Omit<Alert, "from" | "type">) {
  try {
    await aws_monitor.send_alert({
      ...a,
      type: "ERROR",
      from: `commissions-processor:${stage}`,
    });
  } catch (err) {
    report_error(err, { alert: a.title });
  }
}
