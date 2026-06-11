import type { LoaderFunction } from "react-router";
import * as v from "valibot";
import { resp } from "@/helpers/https";
import { $int_gte1, segment } from "@/schemas";
import { npo_by_slug, npo_get } from "$/pg/queries/npo";

export const headers = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const loader: LoaderFunction = async ({ params }) => {
  const p1 = v.safeParse(v.union([$int_gte1, segment]), params.id);
  if (p1.issues) throw resp.status(400, p1.issues[0].message);
  const id = p1.output;
  const npo =
    typeof id === "number" ? await npo_get(id) : await npo_by_slug(id);
  if (!npo || npo.active === false) return resp.status(404);
  return resp.json(npo);
};
