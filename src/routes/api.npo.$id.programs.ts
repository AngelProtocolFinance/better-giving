import type { LoaderFunction } from "react-router";
import { safeParse } from "valibot";
import { resp } from "@/helpers/https";
import { $int_gte1 } from "@/schemas";
import { npo_programs } from "$/pg/queries/program";

// resource route: RR returns the loader Response as-is and does not apply
// the `headers` export, so cache-control is set on the Response.
const cache = "public, s-maxage=60, stale-while-revalidate=300";

export const loader: LoaderFunction = async ({ params }) => {
  const p = safeParse($int_gte1, params.id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const id = p.output;
  const res = await npo_programs(id);
  return resp.json(res, 200, { "cache-control": cache });
};
