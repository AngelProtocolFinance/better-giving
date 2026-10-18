import { href } from "react-router";
import { admin_ctx } from "#/.server/auth";
import { get_funds_npo_memberof } from "#/.server/funds";
import { resp } from "@/helpers/https";
import { campaign_list, campaign_shown_status } from "$/pg/queries/campaign";
import { npo_get } from "$/pg/queries/npo";
import type { Route } from "./+types/route";

export const loader = async ({ context }: Route.LoaderArgs) => {
  const id = context.get(admin_ctx);
  const endow = await npo_get(id);
  if (!endow) throw resp.status(404);
  const [campaigns, funds] = await Promise.all([
    campaign_list(id),
    get_funds_npo_memberof(id, { creator: "ours" }),
  ]);
  return {
    endow,
    campaigns: campaigns.map((c) => ({
      ...c,
      status_label: campaign_shown_status(c),
    })),
    funds,
    profile_to: href("/admin/:id/edit-profile", { id: String(id) }),
  };
};
