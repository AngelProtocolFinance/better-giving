import { safeParse, union } from "valibot";
import { get_session } from "#/.server/auth";
import { get_fund } from "#/.server/fund";
import { segment } from "#/api/schema/segment";
import type { AuthUser } from "#/types/auth";
import type { IFund } from "#/types/fund";
import { fund_id } from "@/fundraiser/schema";
import { resp } from "@/helpers/https";
import type { Route } from "./+types/route";

export interface LoaderData {
  user: AuthUser | undefined;
  fund: IFund;
  base_url: string;
}

const schema = union([fund_id, segment]);

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const { user } = await get_session(request);
  const p = safeParse(schema, params.fund_id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const id = p.output;
  const fund = await get_fund(id);
  if (!fund) throw new Response(null, { status: 404 });

  return {
    user,
    fund,
    base_url: new URL(request.url).origin,
  } satisfies LoaderData;
};
