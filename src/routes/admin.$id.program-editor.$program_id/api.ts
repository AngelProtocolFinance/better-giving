import { safeParse } from "valibot";
import { admin_ctx } from "#/.server/auth";
import { dataWithSuccess } from "#/.server/toast";
import { resp } from "@/helpers/https";
import {
  $int_gte1,
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
  npo_program_update,
} from "$/pg/queries/program";
import type { Route } from "./+types/route";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const p1 = safeParse($int_gte1, params.id);
  if (p1.issues) throw resp.status(400, p1.issues[0].message);
  const p2 = safeParse(program_id, params.program_id);
  if (p2.issues) throw resp.status(400, p2.issues[0].message);
  const prog = await npo_program_get(p2.output);
  if (!prog) throw resp.status(404);
  return prog;
};

export const action = async (x: Route.ActionArgs) => {
  const id = x.context.get(admin_ctx);

  const p_pid = safeParse(program_id, x.params.program_id);
  if (p_pid.issues) return resp.status(400, p_pid.issues[0].message);
  const pid = p_pid.output;

  const { intent, ...p } = await x.request.json();

  if (intent === "add-milestone") {
    await milestone_put(pid, {
      title: `Milestone ${p["next-milestone-num"]}`,
      description_rich: "milestone description",
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
