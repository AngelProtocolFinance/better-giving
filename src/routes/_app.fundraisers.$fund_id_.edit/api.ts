import { and, eq } from "drizzle-orm";
import { safeParse } from "valibot";
import { type AuthUser, get_session, to_auth } from "#/.server/auth";
import { get_fund } from "#/.server/fund";
import { dataWithError, dataWithSuccess } from "#/.server/toast";
import type { IFund } from "#/types/fund";
import { fund_id, fund_update } from "@/fundraiser/schema";
import { resp } from "@/helpers/https";
import { db } from "$/pg/db";
import {
  fund_by_slug,
  fund_close,
  fund_update as fund_update_fn,
} from "$/pg/queries/fund";
import { user_fund_memberships, user_npo_memberships } from "$/pg/schema/user";
import type { Route } from "./+types/route";

export interface LoaderData {
  fund: IFund;
  base_url: string;
  user: AuthUser;
}
export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const { user } = await get_session(request);
  if (!user) return to_auth(request);

  const p_id = safeParse(fund_id, params.fund_id);
  if (p_id.issues) throw resp.status(400, p_id.issues[0].message);
  const id = p_id.output;

  const fund = await get_fund(id);
  if (!fund) throw resp.status(404);

  if (user.role !== "admin") {
    // check fund membership
    const [fund_mem] = await db
      .select({ fund_id: user_fund_memberships.fund_id })
      .from(user_fund_memberships)
      .where(
        and(
          eq(user_fund_memberships.user_id, user.id),
          eq(user_fund_memberships.fund_id, id)
        )
      )
      .limit(1);

    if (!fund_mem && fund.npo_owner) {
      // fallback: check npo ownership of the fund's parent npo
      const [npo_mem] = await db
        .select({ npo_id: user_npo_memberships.npo_id })
        .from(user_npo_memberships)
        .where(
          and(
            eq(user_npo_memberships.user_id, user.id),
            eq(user_npo_memberships.npo_id, fund.npo_owner)
          )
        )
        .limit(1);
      if (!npo_mem) throw resp.status(403);
    } else if (!fund_mem) {
      throw resp.status(403);
    }
  }

  const base_url = new URL(request.url).origin;

  return { fund, user, base_url } satisfies LoaderData;
};

export const action = async ({ request, params }: Route.ActionArgs) => {
  const { user } = await get_session(request);
  if (!user) return to_auth(request);

  const p_id = safeParse(fund_id, params.fund_id);
  if (p_id.issues) throw resp.status(400, p_id.issues[0].message);
  const id = p_id.output;

  const { close = false, ...update } = await request.json();

  if (close) {
    await fund_close(id);
    return dataWithSuccess(null, "Fund closed");
  }

  const p_upd = safeParse(fund_update, update);
  if (p_upd.issues) return resp.status(400, p_upd.issues[0].message);
  const parsed = p_upd.output;

  // check if new slug is already taken (allow fund's own slug)
  if (parsed.slug) {
    const res = await fund_by_slug(parsed.slug);
    if (res && res.id !== id) {
      return dataWithError(null, `Slug ${parsed.slug} is already taken`);
    }
  }

  await fund_update_fn(id, parsed);

  return dataWithSuccess(null, "Fund updated");
};
