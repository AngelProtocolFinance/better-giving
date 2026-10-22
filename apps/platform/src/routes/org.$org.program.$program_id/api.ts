import { redirect } from "react-router";
import { safeParse } from "valibot";
import { program_href } from "#/helpers/org-href";
import { npo_id } from "#/pages/marketplace/npo-id";
import { resp } from "@/helpers/https";
import { program_id } from "@/npo/schema";
import { npo_by_slug, npo_get } from "$/pg/queries/npo";
import { npo_program_get } from "$/pg/queries/program";
import type { Route } from "./+types/route";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const p = safeParse(program_id, params.program_id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const pid = p.output;
  const id = npo_id(params.org);

  const npo = await (typeof id === "number" ? npo_get(id) : npo_by_slug(id));
  if (!npo || npo.active === false) throw resp.status(404);
  // an org with a slug lives at it; its id url is an alias
  if (typeof id === "number" && npo.slug) {
    throw redirect(program_href(npo, pid), 301);
  }

  const prog = await npo_program_get(pid, npo.id);
  if (!prog) throw resp.status(404);

  return {
    npo: {
      id: npo.id,
      slug: npo.slug,
      name: npo.name,
      logo: npo.logo,
      social_media_urls: npo.social_media_urls,
    },
    prog,
    url: new URL(program_href(npo, pid), request.url).toString(),
  };
};
