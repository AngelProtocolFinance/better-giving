import type { ActionFunction } from "react-router";
import { safeParse } from "valibot";
import { get_session, to_auth } from "#/.server/auth";
import { dataWithSuccess } from "#/.server/toast";
import { resp } from "@/helpers/https";
import * as reg_updated from "@/queue/msgs/reg-updated";
import { Progress } from "@/reg/progress";
import { reg_id } from "@/reg/schema";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { reg_get, reg_update } from "$/pg/queries/registration";

export const submit_action: ActionFunction = async ({ request, params }) => {
  const { user } = await get_session(request);
  if (!user) return to_auth(request);

  const p = safeParse(reg_id, params.reg_id);
  if (p.issues) return resp.status(400, p.issues[0].message);
  const id = p.output;
  const reg = await reg_get(id);

  if (!reg) throw resp.status(404, `reg:${id} not found`);

  const r = new Progress(reg).banking;
  if (!r) throw "Registration not ready for submission";

  if (user.email !== r.r_id && user.role !== "admin") {
    throw resp.status(403);
  }

  //reset previous review
  const updated = await reg_update(db, r.id, {
    status: "02",
    status_rejected_reason: null,
  });
  if (updated) await enqueue(reg_updated.to_msg(updated));

  return dataWithSuccess(
    null,
    "Your application has been submitted. We will get back to you soon!"
  );
};
