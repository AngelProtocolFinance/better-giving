import { sql } from "drizzle-orm";
import type { DbOrTx } from "../pg/queries/helpers";
import {
  type IOwedRecovery,
  type OwedParty,
  recover_owed,
  repay_owed,
} from "../pg/queries/owed";
import type { IRecovery, NetPlan } from "./net-owed";

/** one netting run per party at a time: a claim and an unfunded release take
 * this before any payout, commission or owed row, so the two queue instead of
 * each holding a row the other waits on. a refund takes no such lock; the
 * claim matches its row order instead */
export async function lock_run(tx: DbOrTx, key: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`
  );
}

/** each recovery and due-back payment in `plan`, as entries under the run's `ref` */
export async function deduct(
  tx: DbOrTx,
  party: OwedParty,
  reason: IOwedRecovery["reason"],
  plan: Exclude<NetPlan, { status: "under_minimum" }>,
  ref: string
) {
  const now = new Date().toISOString();
  const entry = (r: IRecovery) => ({
    donation_id: r.donation_id,
    party,
    usd: r.usd,
    reason,
    ref,
    now,
  });
  for (const r of plan.recovered) await recover_owed(tx, entry(r));
  for (const r of plan.repaid) await repay_owed(tx, entry(r));
}

/** the step that has to go with resetting a netted claim's rows to pending by
 * hand, in the same transaction, or the next run pays the party in full while
 * the ledger counts what it owes as recovered */
export function undo_deductions(party: OwedParty, ref: string) {
  const [[key, id]] = Object.entries(party) as [[string, string | number]];
  return `run unrecover_owed({ ${key}: ${JSON.stringify(id)}, ref: "${ref}" }) in the transaction that resets them, never the reset alone (it takes back the recover and repay entries under ref ${ref} on the party's owed rows; a claim that netted nothing has none)`;
}
