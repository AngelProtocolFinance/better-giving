import { Progress as ArkProgress } from "@ark-ui/react/progress";
import { Image } from "@better-giving/ui";
import { to_usd } from "@better-giving/ui/helpers";
import {
  isRouteErrorResponse,
  Link,
  type LinksFunction,
  useRouteError,
} from "react-router";
import { Steps } from "#/components/donation";
import { DonorMsgs } from "#/components/donor-msgs";
import { ErrorElement } from "#/components/error/error-element";
import { DappLogo } from "#/components/image";
import { RichText, richtext_styles } from "#/components/rich-text";
import { to_text } from "#/components/rich-text/helpers";
import { app_name } from "#/constants/env";
import { metas } from "#/helpers/seo";
import { use_now } from "#/hooks/use-now";
import { Share } from "#/routes/_app.fundraisers.$fund_id/share";
import { Video } from "#/routes/_app.fundraisers.$fund_id/video";
import type { Route } from "./+types/route";
import { loader } from "./api";
import {
  closed_body,
  donor_label,
  ended_label,
  goal_amount,
  goal_percent,
  tag_label,
  time_left,
} from "./format";

export { loader };
export const links: LinksFunction = () => [...richtext_styles];

export const meta: Route.MetaFunction = ({ loaderData, params, error }) => {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return metas({
      title: `Campaign not found - ${app_name}`,
      description:
        "The link may be mistyped, or the campaign isn't public yet.",
      url: `/org/${params.org}/${params.campaign}`,
    });
  }
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

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  return <ErrorElement />;
}

function NotFound() {
  return (
    <div className="min-h-screen bg-background text-gray-12">
      <div className="mx-auto w-full max-w-[80rem]">
        <div className="page flex flex-col" data-group="page">
          <div
            className="w-full pt-20 pb-2 text-center"
            data-group="error"
            data-section="error"
            data-shell=""
            data-block="error"
          >
            <h1 className="mb-3 text-xl font-bold" data-heading="">
              Campaign not found
            </h1>
            <p className="mx-auto mb-4 max-w-md text-gray-11">
              The link may be mistyped, or the campaign isn't public yet.
            </p>
            <Link to="/marketplace" className="btn btn-secondary mx-auto w-fit">
              Browse nonprofits
            </Link>
          </div>
          <Footer />
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer
      className="mt-10 flex w-full items-center gap-3 border-t py-6 lg:mt-16"
      data-group="footer"
      data-section="footer"
      data-shell=""
      data-block="footer"
    >
      <DappLogo classes="h-8" />
      <span className="text-sm font-semibold">Better Giving</span>
    </footer>
  );
}

export default function Page({ loaderData, params }: Route.ComponentProps) {
  const {
    campaign,
    npo,
    now: loader_now,
    base_url,
    canonical,
    user,
    donor_count,
  } = loaderData;
  const until = campaign.ends_at ? new Date(campaign.ends_at) : undefined;
  const now = use_now(loader_now, until);
  const open =
    campaign.status === "live" &&
    !(
      campaign.ends_at && new Date(campaign.ends_at).getTime() <= now.getTime()
    );
  const goal = goal_amount(campaign.target, campaign.raised);
  const percent = goal == null ? null : goal_percent(campaign.raised, goal);
  const tag = tag_label(campaign.campaign_type);
  const when = open
    ? campaign.ends_at
      ? time_left(campaign.ends_at, now)
      : null
    : ended_label(campaign.ends_at);
  const org = `/marketplace/${params.org}`;

  return (
    <div className="min-h-screen bg-background text-gray-12">
      <div className="mx-auto w-full max-w-[80rem]">
        <div className="page flex flex-col" data-group="page">
          <div
            className="flex h-16 w-full items-center gap-3 lg:h-18"
            data-group="identity"
            data-section="identity"
            data-shell=""
            data-block="identity"
          >
            {campaign.mark && (
              <Image
                src={campaign.mark}
                alt=""
                width={40}
                height={40}
                className="size-8 shrink-0 rounded-full border bg-panel object-cover lg:size-10"
              />
            )}
            <Link
              to={org}
              className="line-clamp-2 min-w-0 text-base font-semibold text-gray-12 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {campaign.owner_name}
            </Link>
          </div>
          {campaign.hero && (
            <Image
              src={campaign.hero}
              alt=""
              data-group="hero"
              data-section="hero"
              data-shell=""
              data-block="hero"
              className="mt-6 aspect-4/1 w-full rounded object-cover"
            />
          )}
          <div
            className="mt-6 grid w-full lg:mt-10 lg:grid-cols-[minmax(0,1fr)_456px] lg:items-start lg:gap-x-12"
            data-group="main"
            data-section="main"
            data-shell=""
            data-block="main"
          >
            <div
              className="contents lg:flex lg:min-w-0 lg:flex-col"
              data-group="column"
              data-col="main"
            >
              <header
                className="order-1 flex flex-col items-start lg:order-none"
                data-group="header"
                data-section="header"
              >
                {tag && (
                  <p className="mb-3 inline-block rounded bg-secondary px-2 py-1 text-xs font-semibold uppercase tracking-badge text-primary-deep">
                    {tag}
                  </p>
                )}
                <h1
                  className={`text-3xl font-bold text-balance break-words lg:text-4_5xl lg:leading-tight ${campaign.program_name ? "mb-3" : ""}`}
                  data-heading=""
                >
                  {campaign.name}
                </h1>
                {campaign.program_name && (
                  <p className="text-sm text-gray-11">
                    Program: {campaign.program_name}
                  </p>
                )}
              </header>
              <section
                className="order-2 mt-10 flex flex-col rounded border bg-panel p-5 lg:order-none lg:mt-12 lg:p-6"
                data-group="progress"
                data-section="progress"
              >
                <div data-section="stats">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0">
                      <span className="figures text-3xl font-bold lg:text-4xl">
                        {to_usd(campaign.raised)}
                      </span>{" "}
                      <span className="text-base text-gray-11">
                        {goal == null
                          ? "raised"
                          : `raised of ${to_usd(goal)} goal`}
                      </span>
                    </p>
                    {percent != null && (
                      <p className="figures shrink-0 whitespace-nowrap text-lg font-semibold text-success-subtle-fg">
                        {percent}%
                      </p>
                    )}
                  </div>
                  {goal != null && (
                    <ArkProgress.Root
                      value={Math.min(campaign.raised, goal)}
                      max={goal}
                      aria-label={`${percent}% of the goal`}
                      className="mt-3 h-2 w-full"
                    >
                      <ArkProgress.Track className="h-full w-full overflow-hidden rounded-full bg-success/10 inset-shadow-track">
                        <ArkProgress.Range className="h-full rounded-full bg-success shadow-track-fill" />
                      </ArkProgress.Track>
                    </ArkProgress.Root>
                  )}
                  <p className="mt-3 text-sm text-gray-11">
                    <span className="figures">{donor_label(donor_count)}</span>
                    {when && (
                      <>
                        <span className="mx-1.5" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-semibold text-gray-12">
                          {when}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <div className="mt-6 border-t pt-6">
                  <Share
                    recipientName={campaign.name}
                    url={canonical}
                    line="Gifts on this page go to the nonprofit running it."
                  />
                </div>
              </section>
              <section
                className="order-4 mt-10 flex min-w-0 flex-col lg:order-none lg:mt-12"
                data-group="story"
                data-section="story"
              >
                <h2 className="mb-4 text-xl font-bold" data-heading="">
                  About this campaign
                </h2>
                <div data-section="prose">
                  <RichText
                    readOnly
                    content={{ value: campaign.description_pt }}
                    classes={{
                      field:
                        "w-full flex flex-col gap-4 text-base leading-relaxed",
                    }}
                  />
                </div>
                {campaign.videos.length > 0 && (
                  <div className="mt-8 flex flex-col gap-4">
                    <h3 className="text-lg font-semibold" data-heading="">
                      Videos
                    </h3>
                    {campaign.videos.map((url, i) => (
                      <Video
                        key={url}
                        url={url}
                        title={`Campaign video ${i + 1}`}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
            <aside
              className="order-3 mt-10 self-start lg:sticky lg:top-6 lg:order-none lg:mt-0"
              data-col="aside"
              data-group="aside"
            >
              <div data-group="donate">
                {open ? (
                  <div className="overflow-clip rounded border">
                    <Steps
                      source="bg-marketplace"
                      mode="live"
                      base_url={base_url}
                      recipient={{
                        id: String(npo.id),
                        name: campaign.name,
                        hide_bg_tip: npo.hide_bg_tip,
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
                        campaign_url: canonical,
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
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-start rounded border bg-panel p-6"
                    data-section="notice"
                  >
                    <h2 className="mb-3 text-xl font-bold" data-heading="">
                      This campaign has ended
                    </h2>
                    <p className="mb-4 text-gray-11">
                      {closed_body(campaign.ends_at)}
                    </p>
                    <Link to={org} className="btn btn-secondary">
                      Visit {campaign.owner_name} profile
                    </Link>
                  </div>
                )}
              </div>
            </aside>
          </div>
          <DonorMsgs
            classes="mt-10 lg:mt-16"
            id={String(campaign.owner_npo_id)}
            campaign_id={campaign.id}
            columns="lg"
          />
          <Footer />
        </div>
      </div>
    </div>
  );
}
