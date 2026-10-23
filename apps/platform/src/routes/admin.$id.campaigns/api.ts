import { href } from "react-router";
import { admin_ctx, user_ctx } from "#/.server/auth";
import { get_funds_npo_memberof } from "#/.server/funds";
import { resp } from "@/helpers/https";
import { campaign_list, campaign_shown_status } from "$/pg/queries/campaign";
import { npo_get } from "$/pg/queries/npo";
import type { Route } from "./+types/route";

export const loader = async ({ context, request }: Route.LoaderArgs) => {
  const id = context.get(admin_ctx);
  const endow = await npo_get(id);
  if (!endow) throw resp.status(404);

  const url = new URL(request.url);
  if (url.searchParams.get("tab") === "fundraisers") {
    // org-created funds list on Your campaigns; a stale ?creator= is ignored
    const funds = await get_funds_npo_memberof(id, { creator: "others" });
    return {
      view: "fundraisers" as const,
      endow,
      funds,
      user: context.get(user_ctx),
    };
  }

  const [campaigns, org_funds] = await Promise.all([
    campaign_list(id),
    get_funds_npo_memberof(id, { creator: "ours" }),
  ]);
  // Stale clients still read supporter_funds on the default tab; empty avoids a crash after the tab move.
  const supporter_funds: typeof org_funds = [];
  return {
    view: "campaigns" as const,
    endow,
    campaigns: campaigns.map((c) => ({
      ...c,
      status_label: campaign_shown_status(c),
    })),
    org_funds,
    supporter_funds,
    // the list no longer shows a profile row; kept for clients still on the
    // old bundle, now landing on the folded profile fields
    profile_to: `${href("/admin/:id/organization", { id: String(id) })}#page`,
  };
};
