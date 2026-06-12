import { get_funds_npo_memberof } from "#/.server/funds";
import { npo_id } from "#/pages/marketplace/npo-id";
import { npo_by_slug, npo_get } from "$/pg/queries/npo";
import { npo_media_list } from "$/pg/queries/npo-media";
import { npo_programs } from "$/pg/queries/program";
import type { Route } from "./+types/route";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const loader = async ({ params }: Route.LoaderArgs) => {
  const id = npo_id(params.id);
  const npo = await (typeof id === "number" ? npo_get(id) : npo_by_slug(id));
  if (!npo || npo.active === false) throw new Response(null, { status: 404 });
  const med_page = npo_media_list(npo.id, {
    type: "video",
    featured: true,
  });

  return {
    npo,

    //lazy
    funds: get_funds_npo_memberof(npo.id, { published: true }),
    media: med_page.then((x) => x.items),
    programs: npo_programs(npo.id),
  };
};
