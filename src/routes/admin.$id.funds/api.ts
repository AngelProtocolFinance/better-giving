import { safeParse } from "valibot";
import { admin_ctx, user_ctx } from "#/.server/auth";
import { get_funds_npo_memberof } from "#/.server/funds";
import { dataWithSuccess } from "#/.server/toast";
import type { AuthUser } from "#/types/auth";
import type { IFundItem } from "@/fundraiser";
import { fund_id } from "@/fundraiser/schema";
import { resp } from "@/helpers/https";
import * as fund_member_removed from "@/queue/msgs/fund-member-removed";
import { enqueue } from "$/kit/queue";
import {
  fund_get_or_slug,
  fund_has_member,
  fund_member_remove,
  fund_members_get,
} from "$/pg/queries/fund";
import type { INpo } from "$/pg/queries/npo";
import { npo_get } from "$/pg/queries/npo";
import type { Route } from "./+types/route";

export interface LoaderData {
  user: AuthUser;
  funds: IFundItem[];
  endow: INpo;
}

export const loader = async (x: Route.LoaderArgs) => {
  const id = x.context.get(admin_ctx);
  const user = x.context.get(user_ctx);

  const endow = await npo_get(id);
  if (!endow) throw resp.status(404);

  const { searchParams: s } = new URL(x.request.url);
  const creator = s.get("creator") as "ours" | "others" | undefined;

  const funds = await get_funds_npo_memberof(endow.id, {
    creator: creator || undefined,
  });
  return { endow, funds, user } satisfies LoaderData;
};

export const action = async (x: Route.ActionArgs) => {
  const id = x.context.get(admin_ctx);

  const fv = await x.request.formData();
  const p = safeParse(fund_id, fv.get("fund_id"));
  if (p.issues) return resp.status(400, p.issues[0].message);
  const fid = p.output;

  const fund = await fund_get_or_slug(fid);
  if (!fund) return { status: 404 };

  const is_member = await fund_has_member(fund.id, id);
  if (!is_member) {
    return { status: 400, statusText: `${id} not member of this fund` };
  }

  const members = await fund_members_get(fund.id);
  const removed = await fund_member_remove(fund.id, id, members.length === 1);
  if (removed) await enqueue(fund_member_removed.to_msg(removed));

  return dataWithSuccess(
    null,
    "You have successfully opted out of this fund. Changes will take effect shortly."
  );
};
