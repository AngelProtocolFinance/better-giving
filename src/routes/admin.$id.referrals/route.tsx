import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { Explainer, Hub, Nonprofits, ReferralId } from "#/components/referrals";
import type { Route } from "./+types/route";
import { Earnings } from "./earnings";

export { loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export default CacheRoute(Page);

function Page({ loaderData }: Route.ComponentProps) {
  const {
    id,
    base_url,
    referreds,
    earnings,
    pending_total,
    payout,
    payout_min,
    payout_ltd,
  } = loaderData;
  return (
    <div className="px-6 py-4 md:px-10 md:py-8">
      <Explainer classes="mb-4" />
      <Hub classes="mb-8" />
      <h3 className="mt-8 mb-4 text-2xl">Referral ID and Link</h3>
      <ReferralId classes="mb-8" referral_id={id} base_url={base_url} />
      <Earnings
        classes="mb-8"
        earnings={{
          items: earnings.items,
          ...(earnings.next && { see_all: "earnings" }),
        }}
        payout={payout}
        payout_min={payout_min}
        pending_total={pending_total}
        payout_ltd={payout_ltd}
      />
      <Nonprofits npos={referreds} classes="mb-8" />
    </div>
  );
}
