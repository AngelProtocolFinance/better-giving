import type { ActionFunction } from "react-router";
import { msg } from "@/queue";
import { enqueue, verify_qstash } from "$/kit/queue";
import {
  owed_notices_due,
  queue_owed_notices_missed,
} from "$/pg/queries/owed-notice";

/**
 * the sender's poll: every unsent owed notice goes on the queue as its own
 * message. the ledger writes that create notices run in many transactions
 * (refunds, disputes, credits, runs, admin write-offs), so the queue is fed
 * from the table rather than from each of them. a notice the next tick still
 * finds due is enqueued again: inside qstash's dedupe window that message is
 * dropped, and past it the handler's claim answers a sent notice as done.
 */
export const action: ActionFunction = async ({ request }) => {
  await verify_qstash(request);
  // rows recorded before the effective date was set have had no notice queued
  await queue_owed_notices_missed();
  const due = await owed_notices_due();
  await enqueue(...due.map((n) => msg("owed-notice", { id: n.id })));
  return new Response("ok", { status: 200 });
};
