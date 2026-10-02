import { report_degraded } from "#/errors/report";
import type { IInput } from "@/types/donation-dist";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { is_unique_violation } from "$/pg/errors";
import { dist_of } from "$/pg/queries/dist";
import { DISTS_DONATION_ID_TO_ID_UNIQ } from "$/pg/schema/dist";
import { settle_npo, settled_npo_msgs } from "$/settlement/settle-npo";

export type { IInput, ISource, ISttlmnt } from "@/types/donation-dist";

export const handle_npo = async (i: IInput): Promise<void> => {
  let msgs: Awaited<ReturnType<typeof settle_npo>>["msgs"];
  try {
    ({ msgs } = await db.transaction((tx) => settle_npo(tx, i)));
  } catch (e) {
    if (!(await already_settled(e, i))) throw e;
    // the enqueue follows the commit, so the first delivery may have died
    // between them, and this redelivery is the only thing left to send them.
    // a failure here throws out of the action, which handleError reports
    await enqueue(...(await settled_npo_msgs(db, i)));
    // reached only by a provider's redelivery or a qstash enqueue that failed,
    // and the resend absorbs both
    report_degraded(e, { donation_id: i.prnt.id, npo_id: i.id });
    return;
  }
  if (msgs.length) {
    await enqueue(...msgs);
    console.info(`handled npo ${i.id}`);
  }
};

/**
 * the 23505 is the usual signal, but on neon drizzle's own rollback can fail on
 * a dead socket and replace it with a codeless error — so any other failure
 * asks the table. a failed read leaves the original error to be rethrown.
 */
async function already_settled(e: unknown, i: IInput): Promise<boolean> {
  if (is_unique_violation(e, DISTS_DONATION_ID_TO_ID_UNIQ)) return true;
  return dist_of(i.prnt.id, +i.id)
    .then(Boolean)
    .catch(() => false);
}
