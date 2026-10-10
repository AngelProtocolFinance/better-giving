import type { IDonation } from "@/donations";
import type { NP } from "@/nowpayments/types";
import { db } from "$/pg/db";
import {
  donation_settle_state_locked,
  donation_update,
} from "$/pg/queries/donation";
import { reverse_charge, WHOLE } from "$/refund/reverse";
import { ref_of } from "./payment";
import { type Action, transition } from "./status";

/**
 * a donation that never settled is marked `refunded` under its row lock. a
 * settled one is reversed by `reverse_charge`, which writes the status itself
 * once every dist is back — never written here first, or the redelivery a
 * failed reversal needs would find the row already closed.
 */
export async function handle_refund(
  don: IDonation,
  payment: NP.PaymentPayload,
  flags: { repeat: boolean }
): Promise<Action> {
  const now = await db.transaction(async (tx) => {
    const state = await donation_settle_state_locked(tx, don.id);
    const now = transition(state ?? null, payment, flags);
    if (now.op === "refund" && !now.was_settled) {
      await donation_update(tx, don.id, { status: "refunded" });
    }
    return now;
  });
  if (now.op !== "refund" || !now.was_settled) return now;

  const res = await reverse_charge({
    donation_id: don.id,
    rail: "crypto",
    source: "refund",
    // nowpayments has no partial refund: a refunded payment went back whole
    share: WHOLE,
    alert_from: "nowpayments-refunded",
    notice: {
      id: `nowpayments-refunded_${payment.payment_id}`,
      lines: [ref_of(payment)],
    },
  });
  switch (res.status) {
    case "reversed":
    case "already_reversed":
    // unreachable with a whole share and no unsent refunds. acked: a
    // redelivery passes the same share, and the entry posts its own notice
    case "partial_owed":
    case "partial_pending":
    case "held":
    case "unsized":
      return now;
    // the throw answers 5xx, which nowpayments redelivers: until a dist queued
    // after the settle lands, or until every failed dist is reversed
    case "failed":
      throw new Error(`refund not reversed, ${res.reason}: ${don.id}`);
    default:
      return res satisfies never;
  }
}
