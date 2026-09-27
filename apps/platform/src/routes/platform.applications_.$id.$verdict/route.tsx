import { type ActionFunction, redirect } from "react-router";
import { literal, object, safeParse, variant } from "valibot";
import { resp } from "@/helpers/https";
import { msg } from "@/queue";
import { Progress } from "@/reg/progress";
import { reg_id } from "@/reg/schema";
import { $ } from "@/schemas";
import { enqueue, in_dedupe_window } from "$/kit/queue";
import { db } from "$/pg/db";
import { reg_get, reg_update_from } from "$/pg/queries/registration";
import { announce_approval, npo_new } from "./npo-new";

export { ErrorModal as ErrorBoundary } from "#/components/error";
export { default } from "./prompt";

const approval = object({ type: literal("approved") });
const rejection = object({
  type: literal("rejected"),
  reason: $,
});
export const schema = variant("type", [approval, rejection]);

export const action: ActionFunction = async ({ request, params }) => {
  const fv: { reason?: string } = await request.json();

  const p1 = safeParse(reg_id, params.id);
  if (p1.issues) return resp.status(400, p1.issues[0].message);
  const id = p1.output;
  const p2 = safeParse(schema, {
    type: params.verdict,
    reason: fv.reason ?? "",
  });
  if (p2.issues) return resp.status(400, p2.issues[0].message);
  const verdict = p2.output;

  const reg = await reg_get(id);
  if (!reg) throw new Response("Registration not found", { status: 404 });

  const r = new Progress(reg).banking; // no need to look at fsa
  if (!r) throw resp.status(400, "registration has incomplete steps");

  // a row already at this verdict's status is a repeat of it: a retry after
  // its response or enqueue was lost, or a stale prompt. inside qstash's dedupe
  // window it is announced again under the same keys; past it, it answers
  // success and enqueues nothing.
  const settled = verdict.type === "approved" ? "03" : "04";
  if (reg.status !== "02" && reg.status !== settled) {
    throw resp.status(
      409,
      `registration not in review, curr status:${reg.status}`
    );
  }

  if (verdict.type === "rejected") {
    const { row } = await reg_update_from(db, id, ["02"], {
      status: "04",
      status_rejected_reason: verdict.reason,
    });
    // a re-reject repeats the stored reason, or it is a second verdict
    if (row?.status !== "04" || row.status_rejected_reason !== verdict.reason) {
      throw resp.status(409, "registration not in review");
    }
    if (in_dedupe_window(row.updated_at)) {
      await enqueue(msg("reg-updated", row));
    }
    return redirect("../success");
  }
  const npo =
    reg.status === "03" ? await announce_approval(reg) : await npo_new(r);
  console.info("NPO approved:", npo);
  return redirect("../success");
};
