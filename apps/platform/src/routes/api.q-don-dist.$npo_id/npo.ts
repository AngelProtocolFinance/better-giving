import { report_degraded, report_error } from "#/errors/report";
import { type IDonDistPayload, type IMsg, msg } from "@/queue";
import type { IInput } from "@/types/donation-dist";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { is_unique_violation } from "$/pg/errors";
import { dist_of } from "$/pg/queries/dist";
import { DISTS_DONATION_ID_TO_ID_UNIQ } from "$/pg/schema/dist";
import { replan_npo, settle_npo } from "$/settlement/settle-npo";

export type { IInput, ISource, ISttlmnt } from "@/types/donation-dist";

export const handle_npo = async (i: IInput): Promise<void> => {
  let msgs: Awaited<ReturnType<typeof settle_npo>>["msgs"];
  try {
    ({ msgs } = await db.transaction((tx) => settle_npo(tx, i)));
  } catch (e) {
    if (!(await already_settled(e, i))) throw e;
    const ctx = { donation_id: i.prnt.id, npo_id: i.id };
    // the enqueue follows the commit, so the first delivery may have died
    // between them, and this redelivery is the only thing left to send them
    try {
      await enqueue(...(await resendable_msgs(i)));
    } catch (re) {
      report_error(re, { ...ctx, during: "settled dist resend" });
      throw re;
    }
    // reached only by a provider's redelivery or a qstash enqueue that failed,
    // and the resend absorbs both
    report_degraded(e, ctx);
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

/**
 * the settled dist's msgs that absorb a resend downstream. only `don-dist`
 * does — its handler's notice claim on the dist row runs each step once.
 * `tip-received` and `lock-tx-created` mail ops with no send-once gate, and
 * qstash's dedupe holds only inside its window — the tip's key is an id the
 * replan mints afresh anyway — so a resend would mail them twice.
 */
async function resendable_msgs(i: IInput): Promise<IMsg[]> {
  const dist = await dist_of(i.prnt.id, +i.id);
  if (!dist) throw new Error(`dist for npo:${i.id} vanished after settling`);
  const plan = await replan_npo(i);
  return plan.msgs.flatMap((m) => {
    if (m.id !== "don-dist") return [];
    const p = m.payload as IDonDistPayload;
    // the plan mints a fresh dist id; the notice claim is on the stored one
    return [msg("don-dist", { ...p, id: dist.id, net: dist.net ?? p.net })];
  });
}
