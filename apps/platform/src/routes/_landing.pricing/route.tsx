import { app_name } from "#/constants/env";
import { metas } from "#/helpers/seo";
import { CtaBand } from "#/pages/@sections/cta-band";
import type { Route } from "./+types/route";
import { Includes } from "./includes";
import { PriceCards } from "./price-cards";
import { WhoPays } from "./who-pays";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({
    title: `Pricing | ${app_name}`,
    description:
      "Free forever for nonprofits. $0 platform fees, no contracts. Sustained by optional donor contributions at checkout, always opt-in.",
  });

export default function Page() {
  return (
    <main>
      <div className="relative isolate overflow-clip bg-linear-to-b from-background to-band pt-20 pb-16 md:pt-28 md:pb-20 text-center">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 dot-grid dot-grid-fade"
        />
        <div className="page grid justify-items-center">
          <p className="eyebrow text-primary">Pricing</p>
          <h1 className="hero-heading mt-5 max-w-4xl">
            Free. Forever. <em className="text-primary">Really.</em>
          </h1>
          <p className="section-body mt-6 text-gray-11 max-w-3xl">
            Not free-then-paid. Not free-with-gated-features. We're a nonprofit
            like you. We grant out 100% of donations and never take a cut.
          </p>
        </div>
      </div>

      <PriceCards classes="bg-band pb-24 md:pb-32" />

      <WhoPays classes="py-24 md:py-32" />

      <Includes classes="bg-band py-16 md:py-20" />

      <CtaBand
        title="Keep every dollar working for your mission"
        subtitle="No platform fees, no fund fees, no surprises. Just free tools built by a fellow nonprofit."
      />
    </main>
  );
}
