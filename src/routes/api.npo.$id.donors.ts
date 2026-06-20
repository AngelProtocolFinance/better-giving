import type { LoaderFunction } from "react-router";
import * as v from "valibot";
import { npo_donors } from "#/.server/npo-donors";
import { fund_id } from "@/fundraiser/schema";
import { resp, search } from "@/helpers/https";
import { $int_gte1 } from "@/schemas";

const schema = v.union([fund_id, $int_gte1]);

// resource routes return the loader Response as-is; React Router does not
// apply the `headers` export here, so cache-control is set on the Response.
const cache = "public, s-maxage=60, stale-while-revalidate=300";

export const loader: LoaderFunction = async ({ params, request }) => {
  const p = v.safeParse(schema, params.id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const id = p.output;

  const { next } = search(request);

  const page = await npo_donors(id.toString(), next);
  return resp.json(page, 200, { "cache-control": cache });
};
