import type { LoaderFunction } from "react-router";
import * as v from "valibot";
import { resp } from "@/helpers/https";
import { reg_number } from "@/npo/schema";
import { npo_by_regnum } from "$/pg/queries/npo";

export const headers = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const loader: LoaderFunction = async ({ params }) => {
  const p = v.safeParse(reg_number, params.id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const id = p.output;
  const res = await npo_by_regnum(id);
  if (!res) return resp.status(404);
  return resp.json(res);
};
