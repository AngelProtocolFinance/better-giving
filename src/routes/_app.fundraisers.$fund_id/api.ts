import { safeParse, union } from "valibot";
import { get_fund } from "#/.server/fund";
import { segment } from "#/api/schema/segment";
import type { IFund } from "#/types/fund";
import { fund_id } from "@/fundraiser/schema";
import { resp } from "@/helpers/https";
import type { Route } from "./+types/route";

export interface LoaderData extends IFund {
  url: string;
}

const schema = union([fund_id, segment]);

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const p = safeParse(schema, params.fund_id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const fund = await get_fund(p.output);
  if (!fund) throw new Response(null, { status: 404 });
  return { ...fund, url: url.toString() };
};
