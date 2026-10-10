import { sql } from "drizzle-orm";
import { report_error } from "#/errors/report";
import { TERMS_EFFECTIVE, terms_effective_at } from "@/terms";
import { owed_deductions, stage } from "../env";
import { aws_monitor } from "../kit/discord";
import type { DbOrTx } from "../pg/queries/helpers";
import {
  type IOwedRecovery,
  type OwedParty,
  recover_owed,
  repay_owed,
} from "../pg/queries/owed";
import type { IRecovery, NetPlan } from "./net-owed";

let misconfig_reported = false;

/** whether the grant and commission runs net what parties owe: the
 * `OWED_DEDUCTIONS` switch is on and the terms' effective date parses. on
 * with no date, they net nothing and say so once per server instance; the
 * rows' own rule (`owed_deductible`) holds back the rest until that date */
export async function owed_netting_on(): Promise<boolean> {
  if (!owed_deductions) return false;
  if (terms_effective_at(TERMS_EFFECTIVE)) return true;
  if (!misconfig_reported) {
    misconfig_reported = true;
    await aws_monitor
      .send_alert({
        type: "ERROR",
        from: `owed-netting:${stage}`,
        title: "owed deductions on with no terms effective date",
        body: `OWED_DEDUCTIONS is on but TERMS_EFFECTIVE (lib/terms.ts) is not a date: ${JSON.stringify(TERMS_EFFECTIVE)}. the grant and commission runs net nothing until it is.`,
      })
      .catch((err) =>
        report_error(err, { alert: "owed netting misconfigured" })
      );
  }
  return false;
}

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
