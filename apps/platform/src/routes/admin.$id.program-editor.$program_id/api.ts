import { safeParse } from "valibot";
import { admin_ctx } from "#/.server/auth";
import { dataWithSuccess } from "#/.server/toast";
import { resp } from "@/helpers/https";
import {
  milestone_id,
  milestone_update,
  program_id,
  program_update,
} from "@/npo/schema";
import {
  milestone_delete,
  milestone_put,
  milestone_update as milestone_update_db,
  npo_program_get,
  npo_program_owned,
  npo_program_update,
} from "$/pg/queries/program";
import type { Route } from "./+types/route";

/** 404 on another npo's program as on a missing one, so its existence doesn't leak */
const owned_program_id = async (
  x: Route.LoaderArgs | Route.ActionArgs
): Promise<string> => {
  const p = safeParse(program_id, x.params.program_id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const owned = await npo_program_owned(x.context.get(admin_ctx), p.output);
  if (!owned) throw resp.status(404);
  return p.output;
};

export const loader = async (x: Route.LoaderArgs) => {
  const pid = await owned_program_id(x);
  const prog = await npo_program_get(pid);
  if (!prog) throw resp.status(404);
  return prog;
};

export const action = async (x: Route.ActionArgs) => {
  const id = x.context.get(admin_ctx);
  const pid = await owned_program_id(x);

  const { intent, ...p } = await x.request.json();

  if (intent === "add-milestone") {
    await milestone_put(pid, {
      title: `Milestone ${p["next-milestone-num"]}`,
      description_pt: "[]",
      date: new Date().toISOString(),
    });
    return dataWithSuccess(null, "Milestone added");
  }

  if (intent === "delete-milestone") {
    const p_mid = safeParse(milestone_id, p["milestone-id"]);
    if (p_mid.issues) return resp.status(400, p_mid.issues[0].message);
    await milestone_delete(pid, p_mid.output);
    return dataWithSuccess(null, "Milestone deleted");
  }

  if (intent === "edit-milestone") {
    const { "milestone-id": mid_raw, ...rest } = p;
    const p_mid = safeParse(milestone_id, mid_raw);
    if (p_mid.issues) return resp.status(400, p_mid.issues[0].message);
    const p_upd8 = safeParse(milestone_update, rest);
    if (p_upd8.issues) return resp.status(400, p_upd8.issues[0].message);
    await milestone_update_db(pid, p_mid.output, p_upd8.output);
    return dataWithSuccess(null, "Milestone updated");
  }

  //edit program
  const p_upd8 = safeParse(program_update, p);
  if (p_upd8.issues) return resp.status(400, p_upd8.issues[0].message);
  await npo_program_update(id, pid, p_upd8.output);

  return dataWithSuccess(null, "Program updated");
};
