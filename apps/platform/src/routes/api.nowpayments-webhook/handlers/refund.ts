import type { IDonation } from "@/donations";
import type { NP } from "@/nowpayments/types";
import { db } from "$/pg/db";
import { dists_for_refund } from "$/pg/queries/dist";
import {
  donation_settle_state_locked,
  donation_update,
} from "$/pg/queries/donation";
import { process_refund } from "$/refund/process";
import { type Action, transition } from "./status";

/**
 * a donation that never settled is marked `refunded` under its row lock. a
 * settled one is reversed by `process_refund`, which writes the status itself
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

  const graphs = await dists_for_refund(don.id);
  // settled, not yet distributed: throw so nowpayments redelivers until it is
  if (graphs.length === 0) {
    throw new Error(`no settled dists for donation: ${don.id}`);
  }
  await process_refund(don.id, graphs, {
    form_id: don.form_id ?? null,
    program_id: don.program?.id ?? null,
    alert_from: "nowpayments-refunded",
  });
  return now;
}
