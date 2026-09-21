import { report_error } from "#/errors/report";
import type { IInput } from "@/types/donation-dist";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { is_unique_violation } from "$/pg/errors";
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
    if (is_unique_violation(e, DISTS_DONATION_ID_TO_ID_UNIQ)) {
      report_error(e, { donation_id: i.prnt.id, npo_id: i.id });
      return;
    }
    throw e;
  }
};
