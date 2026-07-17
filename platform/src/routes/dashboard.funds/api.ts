import { user_ctx } from "#/.server/auth";
import { funds_batch_get, type IFundRow } from "$/pg/queries/fund";
import { user_funds as get_user_funds } from "$/pg/queries/user";
import type { Route } from "./+types/route";

export interface LoaderData {
  funds: IFundRow[];
}

export const user_funds = async ({ context }: Route.LoaderArgs) => {
  const user = context.get(user_ctx);

  const fund_ids = await get_user_funds(user.id);
  const funds = await funds_batch_get(fund_ids);

  return { funds } satisfies LoaderData;
};
