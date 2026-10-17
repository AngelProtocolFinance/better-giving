import { Target, to_target } from "@better-giving/ui";
import type { LinksFunction } from "react-router";
import { Steps } from "#/components/donation";
import { DonorMsgs } from "#/components/donor-msgs";
import { DappLogo } from "#/components/image";
import { RichText, richtext_styles } from "#/components/rich-text";
import { to_text } from "#/components/rich-text/helpers";
import { app_name } from "#/constants/env";
import { metas } from "#/helpers/seo";
import { use_now } from "#/hooks/use-now";
import { Share } from "#/routes/_app.fundraisers.$fund_id/share";
import type { Route } from "./+types/route";

export { ErrorBoundary } from "#/components/error";
export { loader } from "./api";
export const links: LinksFunction = () => [...richtext_styles];

export const meta: Route.MetaFunction = ({ loaderData, params }) => {
  if (!loaderData) return [];
  const { campaign, canonical } = loaderData;
  const story = to_text(campaign.description_pt);
  return metas({
    title: `${campaign.name} - ${app_name}`,
    description: story.slice(0, 140),
    name: campaign.name,
    image: campaign.hero,
    url: canonical ?? `/org/${params.org}/${params.campaign}`,
  });
};

function open_now(status: string, ends_at: string | null, now: Date) {
  if (status !== "live") return false;
  if (ends_at && new Date(ends_at).getTime() <= now.getTime()) return false;
  return true;
}

function days_left(ends_at: string, now: Date) {
  const ms = new Date(ends_at).getTime() - now.getTime();
  if (ms <= 0) return null;
  const days = Math.ceil(ms / 86_400_000);
  return days === 1 ? "Ends in 1 day" : `Ends in ${days} days`;
}

export default function Page({ loaderData }: Route.ComponentProps) {
  const {
    campaign,
    npo,
    now: loader_now,
    base_url,
    canonical,
    user,
  } = loaderData;
  const until = campaign.ends_at ? new Date(campaign.ends_at) : undefined;
  const now = use_now(loader_now, until);
  const closed = !open_now(campaign.status, campaign.ends_at, now);
  const left = campaign.ends_at ? days_left(campaign.ends_at, now) : null;

  return (
    <div className="min-h-screen grid grid-rows-[auto_1fr_auto] bg-background text-gray-12">
      <header>
        <div
          className="h-64 w-full bg-panel bg-cover bg-center"
          style={
            campaign.hero
              ? { backgroundImage: `url('${campaign.hero}')` }
              : undefined
          }
        />
        <div className="page -mt-12 flex items-end gap-4">
          {campaign.mark && (
            <img
              src={campaign.mark}
              alt=""
              className="size-24 rounded-full border bg-panel object-cover"
            />
          )}
          <p className="pb-2 text-sm text-gray-11">{campaign.owner_name}</p>
        </div>
      </header>
      <main className="page grid items-start gap-8 py-8 lg:grid-cols-[1fr_24rem]">
        <article className="grid gap-6">
          <h1 className="text-4xl font-bold">{campaign.name}</h1>
          <Target
            text={<Target.Text classes="mb-2" />}
            progress={campaign.raised}
            target={to_target(campaign.target ?? "0")}
          />
          {left && <p className="text-sm text-gray-11">{left}</p>}
          <Share recipientName={campaign.name} url={canonical} />
          <RichText
            readOnly
            content={{ value: campaign.description_pt }}
            classes={{ field: "w-full" }}
          />
          {campaign.videos.length > 0 && (
            <ul className="grid gap-2">
              {campaign.videos.map((url) => (
                <li key={url}>
                  <a href={url} className="link">
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <DonorMsgs
            id={String(campaign.owner_npo_id)}
            campaign_id={campaign.id}
          />
        </article>
        <aside>
          {closed ? (
            <p className="card text-center">
              This campaign isn't accepting donations right now.
            </p>
          ) : (
            <Steps
              source="bg-marketplace"
              mode="live"
              base_url={base_url}
              recipient={{
                id: String(npo.id),
                name: campaign.name,
                hide_bg_tip: campaign.hide_bg_tip,
                members: [String(npo.id)],
                donor_address_required: npo.donor_address_required,
              }}
              config={{
                id: null,
                success_redirect: undefined,
                freq_opts: campaign.donate_frequencies ?? undefined,
                method_ids: campaign.donate_methods ?? undefined,
                increments: campaign.increments ?? undefined,
                campaign_id: campaign.id,
                prefill_amount_usd: loaderData.prefill_amount_usd,
                prefill_frequency: loaderData.prefill_frequency,
              }}
              program={
                campaign.program_id
                  ? {
                      id: campaign.program_id,
                      name: campaign.program_name ?? "",
                    }
                  : undefined
              }
              user={user}
            />
          )}
        </aside>
      </main>
      <footer className="border-t">
        <div className="page flex items-center gap-3 py-6">
          <DappLogo classes="h-8" />
          <span className="text-sm font-semibold">Better Giving</span>
        </div>
      </footer>
    </div>
  );
}
