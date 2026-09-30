import { report_error } from "#/errors/report";
import type { IInput } from "@/types/donation-dist";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { is_unique_violation } from "$/pg/errors";
import { dist_exists } from "$/pg/queries/dist";
import { DISTS_DONATION_ID_TO_ID_UNIQ } from "$/pg/schema/dist";
import { settle_npo } from "$/settlement/settle-npo";

export type { IInput, ISource, ISttlmnt } from "@/types/donation-dist";

export const handle_npo = async (i: IInput): Promise<void> => {
  try {
    const { msgs } = await db.transaction((tx) => settle_npo(tx, i));
    if (msgs.length) {
      await enqueue(...msgs);
      console.info(`handled npo ${i.id}`);
    }
  } catch (e) {
    // already settled. reported because if the first delivery's enqueue
    // failed after its commit, its messages are lost and this is the only trace
    if (await already_settled(e, i)) {
      report_error(e, { donation_id: i.prnt.id, npo_id: i.id });
      return;
    }
    throw e;
  }
};

/**
 * the 23505 is the usual signal, but on neon drizzle's own rollback can fail on
 * a dead socket and replace it with a codeless error — so any other failure
 * asks the table. a failed read leaves the original error to be rethrown.
 */
async function already_settled(e: unknown, i: IInput): Promise<boolean> {
  if (is_unique_violation(e, DISTS_DONATION_ID_TO_ID_UNIQ)) return true;
  return dist_exists(i.prnt.id, +i.id).catch(() => false);
}
