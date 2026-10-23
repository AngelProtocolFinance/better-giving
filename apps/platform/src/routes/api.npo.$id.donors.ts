import type { LoaderFunction } from "react-router";
import * as v from "valibot";
import { npo_donors } from "#/.server/npo-donors";
import { fund_id } from "@/fundraiser/schema";
import { resp, search } from "@/helpers/https";
import { $int_gte1 } from "@/schemas";
import { npo_get } from "$/pg/queries/npo";

const schema = v.union([fund_id, $int_gte1]);

const cache = "public, s-maxage=60, stale-while-revalidate=300";

export const loader: LoaderFunction = async ({ params, request }) => {
  const p = v.safeParse(schema, params.id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const id = p.output;
  const q = new URL(request.url).searchParams;
  const campaign_id = q.get("campaign_id") || undefined;

  if (typeof id === "number") {
    const npo = await npo_get(id);
    if (!npo || npo.active === false) throw resp.status(404);
    // the whole feed is public only while the profile is; a campaign's is
    // public with its page, which serves whether or not the org is published
    if (!npo.published && !campaign_id) throw resp.status(404);
  }

  const { next } = search(request);
  const with_message = q.get("with_message") === "1";

  const page = await npo_donors(id.toString(), next, campaign_id, with_message);
  return resp.json(page, 200, { "cache-control": cache });
};
