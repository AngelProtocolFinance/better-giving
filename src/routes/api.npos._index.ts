import type { LoaderFunction } from "react-router";
import { safeParse } from "valibot";
import { get_npos } from "#/.server/npos";
import { resp, search } from "@/helpers/https";
import { npos_search } from "@/npo/schema";

// resource route: RR returns the loader Response as-is and does not apply
// the `headers` export, so cache-control is set on the Response.
const cache = "public, s-maxage=60, stale-while-revalidate=300";

export const loader: LoaderFunction = async ({ request }) => {
  const params = safeParse(npos_search, search(request));
  if (params.issues) return resp.err(400, params.issues[0].message);

  const page = await get_npos(params.output);

  return resp.json(page, 200, { "cache-control": cache });
};
