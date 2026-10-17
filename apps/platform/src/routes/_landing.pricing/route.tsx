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
      "Fundraising with no platform fee while the optional donor contribution stays on. Turning that ask off is 1.5%. Fiscal sponsorship is 2.9% of each sponsored gift.",
  });

export default function Page() {
  return (
    <main>
      <div className="bg-band pt-20 pb-16 md:pt-28 md:pb-20">
        <div className="page grid gap-6 justify-items-start">
          <h1 className="hero-heading max-w-4xl">Free. Forever. Really.</h1>
          <p className="section-body text-gray-11 max-w-3xl">
            Not free-then-paid. Not free-with-gated-features. We're a nonprofit
            like you. There is no platform fee while donors can add an optional
            contribution. Turning that ask off is a 1.5% fee. Fiscal sponsorship
            is 2.9% of each sponsored gift.
          </p>
        </div>
      </div>

      <PriceCards classes="bg-band pb-24 md:pb-32" />

      <WhoPays classes="py-24 md:py-32" />

      <Includes classes="bg-band py-16 md:py-20" />

      <CtaBand
        title="Keep every dollar working for your mission"
        subtitle="No platform fee while the optional donor contribution stays on. Turning that ask off is a 1.5% fee."
      />
    </main>
  );
}
