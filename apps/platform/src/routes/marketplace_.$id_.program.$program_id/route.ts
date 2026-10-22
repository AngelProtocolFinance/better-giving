import { redirect } from "react-router";
import { program_href } from "#/helpers/org-href";
import { npo_id } from "#/pages/marketplace/npo-id";
import { npo_get } from "$/pg/queries/npo";
import type { Route } from "./+types/route";

/** the program page moved under the profile at /org/<slug|id> */
export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const id = npo_id(params.id);
  const { search } = new URL(request.url);
  const org =
    typeof id === "number" ? await npo_get(id) : { id, slug: id as string };
  if (!org) throw new Response(null, { status: 404 });
  return redirect(`${program_href(org, params.program_id)}${search}`, 301);
};
