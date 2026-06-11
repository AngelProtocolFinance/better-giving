import { safeParse } from "valibot";
import { admin_ctx } from "#/.server/auth";
import { dataWithSuccess, redirectWithSuccess } from "#/.server/toast";
import { routes } from "#/pages/admin/routes";
import { resp } from "@/helpers/https";
import type { IProgramDb } from "@/npo";
import { program_id } from "@/npo/schema";
import {
  npo_program_del,
  npo_program_put,
  npo_programs,
} from "$/pg/queries/program";
import type { Route } from "./+types/route";

export interface LoaderData {
  programs: IProgramDb[];
}

export const loader = async (x: Route.LoaderArgs) => {
  const id = x.context.get(admin_ctx);

  const programs = await npo_programs(id);
  return { programs } satisfies LoaderData;
};

export const action = async (x: Route.ActionArgs) => {
  const id = x.context.get(admin_ctx);

  if (x.request.method === "DELETE") {
    const fv = await x.request.formData();
    const p = safeParse(program_id, fv.get("programId"));
    if (p.issues) return resp.status(400, p.issues[0].message);
    const pid = p.output;
    await npo_program_del(id, pid);
    return dataWithSuccess(null, "Program deleted");
  }

  //new program
  const new_id = await npo_program_put(id, {
    title: "New Program",
    description_rich: "Program description",
    milestones: [],
  });

  return redirectWithSuccess(
    `../${routes.program_editor}/${new_id}`,
    "Program created"
  );
};
