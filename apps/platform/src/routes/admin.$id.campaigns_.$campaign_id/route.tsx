import { Breadcrumbs } from "@better-giving/ui";
import { href, type LinksFunction } from "react-router";
import { richtext_styles } from "#/components/rich-text";
import { admin_page_meta } from "#/routes/admin.$id/page-meta";
import { QrCode } from "#/routes/admin.$id.assets/qr-code";
import { STATUS_WORD } from "../admin.$id.campaigns/copy";
import { CampaignForm } from "../admin.$id.campaigns/form";
import type { Route } from "./+types/route";

export { ErrorBoundary } from "#/components/error";
export { action, loader } from "./api";

export const meta: Route.MetaFunction = ({ matches, loaderData }) =>
  admin_page_meta(
    loaderData ? `Edit ${loaderData.campaign.name}` : "Edit campaign",
    matches
  );
export const links: LinksFunction = () => [...richtext_styles];

export default function Page({ loaderData }: Route.ComponentProps) {
  const { endow, campaign, programs, gift_count, campaign_url, shown_status } =
    loaderData;
  const id = String(endow.id);
  return (
    <div className="grid px-6 py-4 md:px-10 md:py-8 gap-6 max-w-4xl">
      <Breadcrumbs
        items={[
          {
            title: "Campaigns",
            to: href("/admin/:id/campaigns", { id }),
            end: true,
          },
          {
            title: campaign.name,
            to: href("/admin/:id/campaigns/:campaign_id", {
              id,
              campaign_id: campaign.id,
            }),
          },
        ]}
      />
      <div>
        <h1 className="text-3xl font-bold">Edit {campaign.name}</h1>
        <p className="text-sm text-gray-11 mt-1">{STATUS_WORD[shown_status]}</p>
      </div>
      <CampaignForm
        init={{
          name: campaign.name,
          slug: campaign.slug,
          campaign_type: campaign.campaign_type ?? "",
          description_pt: campaign.description_pt,
          banner: campaign.banner ?? "",
          logo: campaign.logo ?? "",
          videos: campaign.videos,
          ends_at: campaign.ends_at,
          target: campaign.target,
          increments: campaign.increments ?? [],
          donate_methods: campaign.donate_methods,
          donate_frequencies: campaign.donate_frequencies,
          hide_bg_tip: endow.hide_bg_tip,
          program_id: campaign.program_id,
        }}
        programs={programs}
        locked={!!campaign.published_at}
        status={campaign.status}
        gift_count={gift_count}
        fallback_methods={endow.donate_methods}
        fallback_frequencies={endow.donate_frequencies}
        settings_donation_to={`${href("/admin/:id/settings", { id })}?tab=donation`}
      />
      {campaign_url && (
        <QrCode
          campaign_url={campaign_url}
          profile_url={campaign_url}
          donate_url={campaign_url}
          logo={campaign.mark ?? endow.logo ?? undefined}
          link_url={!!campaign.published_at}
        />
      )}
    </div>
  );
}
