import { href, Link } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import flying_character from "#/assets/images/flying-character.webp";
import { Steps } from "#/components/donation";
import { ExtLink } from "#/components/ext-link";
import { DappLogo } from "#/components/image";
import { Info } from "#/components/status";
import { app_name } from "#/constants/env";
import { INTERCOM_HELP, PRIVACY_POLICY } from "#/constants/urls";
import { metas } from "#/helpers/seo";
import type { Route } from "./+types/route";
import FAQ from "./faq";
import { FundCard } from "./fund-card";

const is_closed = (active: boolean, expiration?: string): boolean => {
  const isExpired = expiration ? expiration < new Date().toISOString() : false;
  return !active || isExpired;
};

export { loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const meta: Route.MetaFunction = ({ loaderData: d }) => {
  return metas({
    title: `Donate to ${d.fund.name} - ${app_name}`,
  });
};

export default CacheRoute(Page);
function Page({ loaderData: { fund, user, base_url } }: Route.ComponentProps) {
  return (
    <div className="w-full">
      <div className="bg-card h-14.75 w-full flex items-center justify-between px-10 mb-4">
        <DappLogo classes="h-12" />
        <Link
          to={href("/fundraisers/:fund_id", { fund_id: fund.id })}
          className="font-semibold  hover:text-primary"
        >
          Cancel
        </Link>
      </div>
      <div className="md:px-4 max-w-274.5 mx-auto grid md:grid-cols-[1fr_auto] items-start content-start gap-4">
        <div className="@container/fund-card col-start-1 row-start-1">
          <FundCard
            id={fund.id}
            progress={fund.donation_total_usd}
            name={fund.name}
            tagline={fund.description_pt}
            logo={fund.logo || flying_character}
            classes="col-start-1 row-start-1"
            target={fund.target ?? "0"}
          />
        </div>
        {/** small screen but space is still enough to render sidebar */}
        <div className="mx-0 border-b md:contents min-[445px]:border min-[445px]:mx-4 rounded">
          {is_closed(fund.active, fund.expiration ?? undefined) ? (
            <Info classes="row-start-2 self-center bg-card rounded h-80 content-center justify-items-center grid">
              This fundraiser is already closed and can't accept any more
              donations
            </Info>
          ) : (
            <Steps
              source="bg-marketplace"
              mode="live"
              base_url={base_url}
              recipient={{
                id: fund.id,
                name: fund.name,
                hide_bg_tip: fund.hide_bg_tip,
                members: fund.members.map((x) => x.id.toString()),
                donor_address_required: false,
              }}
              config={{
                id: null,
                success_redirect: undefined,
                freq_opts: undefined,
                method_ids: fund.fund_donate_methods ?? undefined,
                increments: fund.increments ?? undefined,
                stripe: undefined,
              }}
              program={undefined}
              user={user}
              className="md:border rounded row-start-2"
            />
          )}
        </div>
        <FAQ
          classes="max-md:px-4 md:col-start-2 md:row-span-5 md:w-[18.875rem]"
          //TODO: endowId={1}
          endowId={1}
        />
        <p className="max-md:px-4 mb-4 max-mbcol-start-1 text-sm leading-normal text-left text-muted-fg">
          <span className="block mb-0.5">
            Need help? See{" "}
            <Link to="./#faqs" className="hover:underline font-medium">
              FAQs
            </Link>{" "}
            or contact us at our <A href={INTERCOM_HELP}>Help Center</A>.
          </span>
          <span className="block mb-0.5">
            Have ideas for how we can build a better donation experience?{" "}
            <A href={INTERCOM_HELP}>Send us feedback</A>.
          </span>
          <span className="block">
            We respect your privacy. To learn more, check out our{" "}
            <A href={PRIVACY_POLICY}>Privacy Policy</A>.
          </span>
        </p>
      </div>
    </div>
  );
}

const A: typeof ExtLink = ({ className, ...props }) => {
  return (
    <ExtLink
      {...props}
      className={`${className} font-medium hover:underline`}
    />
  );
};
