import { redirect } from "react-router";
import { org_href } from "#/helpers/org-href";
import { npo_id } from "#/pages/marketplace/npo-id";
import { npo_get } from "$/pg/queries/npo";
import type { Route } from "./+types/route";

/** the profile moved to /org/<slug|id>; old links and indexed urls follow */
export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const id = npo_id(params.id);
  const { search } = new URL(request.url);
  if (typeof id !== "number") {
    return redirect(`${org_href({ id, slug: id })}${search}`, 301);
  }
  const npo = await npo_get(id);
  if (!npo) throw new Response(null, { status: 404 });
  return redirect(`${org_href(npo)}${search}`, 301);
};
