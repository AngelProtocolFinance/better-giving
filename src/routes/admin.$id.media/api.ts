import { safeParse } from "valibot";
import { resp, search } from "@/helpers/https";
import { $int_gte1 } from "@/schemas";
import { npo_media_list } from "$/pg/queries/npo-media";
import type { Route } from "./+types/route";

export { videos_action } from "#/pages/admin/media/api";

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const p = safeParse($int_gte1, params.id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const endowId = p.output;

  const { nextPageKey: next, featured } = search(request);

  return npo_media_list(endowId, {
    type: "video",
    featured: featured === "1" ? true : undefined,
    limit: 10,
    next,
  });
};
