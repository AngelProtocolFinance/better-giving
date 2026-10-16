import { app_name } from "#/constants/env";
import { metas } from "#/helpers/seo";
import { CtaBand } from "#/pages/@sections/cta-band";
import type { Route } from "./+types/route";
import { Audiences } from "./audiences";
import { Fee } from "./fee";
import { Hero } from "./hero";
import { Steps } from "./steps";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({
    title: `Fiscal Sponsorship | ${app_name}`,
    description: `As a U.S. 501(c)(3), ${app_name} accepts tax-deductible gifts and grants on your behalf. Reach U.S. donors and foundations without your own 501(c)(3), for a 2.9% fee.`,
  });

export default function Page() {
  return (
    <main>
      <Hero />
      <Fee classes="surface-deep py-24 md:py-32" />
      <Audiences classes="py-24 md:py-32" />
      <Steps classes="bg-band py-24 md:py-32" />
      <CtaBand
        title="Open the door to U.S. giving"
        subtitle="Join the 210+ organizations worldwide raising tax-deductible U.S. donations through Better Giving."
      />
    </main>
  );
}
