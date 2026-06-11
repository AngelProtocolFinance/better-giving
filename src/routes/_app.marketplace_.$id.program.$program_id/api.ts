import { safeParse } from "valibot";
import { npo_id } from "#/pages/marketplace/npo-id";
import { resp } from "@/helpers/https";
import { program_id } from "@/npo/schema";
import { npo_by_slug, npo_get } from "$/pg/queries/npo";
import { npo_program_get } from "$/pg/queries/program";
import type { Route } from "./+types/route";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const p = safeParse(program_id, params.program_id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const pid = p.output;
  const id = npo_id(params.id);

  const npo = await (typeof id === "number" ? npo_get(id) : npo_by_slug(id));
  if (!npo) throw resp.status(404);

  const prog = await npo_program_get(pid);
  if (!prog) throw resp.status(404);

  return prog;
};
