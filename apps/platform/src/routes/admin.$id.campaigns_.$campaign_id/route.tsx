import type { LinksFunction } from "react-router";
import { richtext_styles } from "#/components/rich-text";
import { QrCode } from "#/routes/admin.$id.assets/qr-code";
import { CampaignForm } from "../admin.$id.campaigns/form";
import type { Route } from "./+types/route";

export { ErrorBoundary } from "#/components/error";
export { action, loader } from "./api";
export const links: LinksFunction = () => [...richtext_styles];

export default function Page({ loaderData }: Route.ComponentProps) {
  const { endow, campaign, programs, gift_count, campaign_url } = loaderData;
  return (
    <div className="grid px-6 py-4 md:px-10 md:py-8 gap-6 max-w-4xl">
      <h1 className="text-3xl font-bold">Edit campaign</h1>
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
          hide_bg_tip: campaign.hide_bg_tip,
          program_id: campaign.program_id,
        }}
        programs={programs}
        locked={!!campaign.published_at}
        status={campaign.status}
        gift_count={gift_count}
        fallback_methods={endow.donate_methods}
        fallback_frequencies={endow.donate_frequencies}
      />
      {campaign_url && (
        <QrCode
          campaign_url={campaign_url}
          profile_url={campaign_url}
          donate_url={campaign_url}
          logo={campaign.mark ?? endow.logo ?? undefined}
        />
      )}
    </div>
  );
}
