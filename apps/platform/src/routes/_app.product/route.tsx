import { app_name } from "#/constants/env";
import { metas } from "#/helpers/seo";
import { CtaBand } from "#/pages/@sections/cta-band";
import type { Route } from "./+types/route";
import { Features } from "./features";
import { GiftTypes } from "./gift-types";
import { Hero } from "./hero";
import { MembershipAdvantage } from "./membership-advantage";
import { Portability } from "./portability";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({
    title: `Product | ${app_name}`,
    description:
      "One brandable, embeddable donation form: every gift type, express checkout, and recurring giving. No platform fee while the optional donor contribution stays on.",
  });

export default function Page() {
  return (
    <main>
      <Hero />
      <GiftTypes classes="py-24" />
      <Features classes="bg-band py-24" />
      <MembershipAdvantage classes="py-24" />
      <Portability classes="py-24" />
      <CtaBand
        title="Raise more, starting this quarter"
        subtitle="Join the managed platform. No platform fee while the optional donor contribution stays on. Donation records export from your dashboard."
      />
    </main>
  );
}
