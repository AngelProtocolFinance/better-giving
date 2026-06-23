import { type ActionFunction, redirect } from "react-router";
import { literal, object, safeParse, variant } from "valibot";
import { resp } from "@/helpers/https";
import { msg } from "@/queue";
import { Progress } from "@/reg/progress";
import { reg_id } from "@/reg/schema";
import { $ } from "@/schemas";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { reg_get, reg_update } from "$/pg/queries/registration";
import { npo_new } from "./npo-new";

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

  if (reg.status !== "02") {
    throw resp.status(
      400,
      `registration not in review, curr status:${reg.status}`
    );
  }

  if (verdict.type === "rejected") {
    const updated = await reg_update(db, id, {
      status: "04",
      status_rejected_reason: verdict.reason,
    });
    if (updated) await enqueue(msg("reg-updated", updated));
    return redirect("../success");
  }
  const npo = await npo_new(r);
  console.info("NPO created:", npo);
  return redirect("../success");
};
