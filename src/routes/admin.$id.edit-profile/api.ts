import { safeParse } from "valibot";
import { endowUpdate } from "#/pages/admin/endow-update-action";
import { resp } from "@/helpers/https";
import { $int_gte1 } from "@/schemas";
import type { INpo } from "$/pg/queries/npo";
import { npo_get } from "$/pg/queries/npo";
import type { Route } from "./+types/route";

export interface LoaderData extends INpo {
  base_url: string;
}

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const p = safeParse($int_gte1, params.id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const id = p.output;
  const npo = await npo_get(id);
  if (!npo) throw resp.status(404);

  return {
    ...npo,
    base_url: new URL(request.url).origin,
  } satisfies LoaderData;
};

export const action = endowUpdate({ success: "Profile updated" });
