import type { IDonationUpdate } from "@/donations";
import type { NP } from "@/nowpayments/types";
import { db } from "$/pg/db";
import {
  donation_settle_state_locked,
  donation_update,
} from "$/pg/queries/donation";
import { type Action, transition } from "./status";

/**
 * writes `patch` only if the ipn, re-decided against the row under its lock,
 * still takes `op` — a concurrent delivery may have settled or closed the row
 * since the caller read it. returns the decision made under the lock.
 */
export async function write_on(
  id: string,
  payment: NP.PaymentPayload,
  flags: { repeat: boolean },
  op: Action["op"],
  patch: IDonationUpdate
): Promise<Action> {
  return db.transaction(async (tx) => {
    const state = await donation_settle_state_locked(tx, id);
    const now = transition(state ?? null, payment, flags);
    if (now.op === op) await donation_update(tx, id, patch);
    return now;
  });
}
