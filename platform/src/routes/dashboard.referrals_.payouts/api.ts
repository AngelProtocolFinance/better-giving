import { user_ctx } from "#/.server/auth";
import { search } from "@/helpers/https";
import { referrer_payout_list } from "$/pg/queries/referrer";
import { user_get } from "$/pg/queries/user";
import type { Route } from "./+types/route";

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const user = context.get(user_ctx);
  const db_user = await user_get(user.email);
  if (!db_user) throw new Response("user not found", { status: 404 });

  const { nextKey: next } = search(request);
  return referrer_payout_list(db_user.referral_code, { next, limit: 8 });
};
