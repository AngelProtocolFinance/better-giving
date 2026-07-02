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
      "One brandable, embeddable donation form — every gift type, express checkout, recurring giving, and $0 platform fees.",
  });

export default function Page() {
  return (
    <main>
      <Hero />
      <GiftTypes classes="px-6 py-22" />
      <Features classes="bg-accent px-6 py-22" />
      <MembershipAdvantage classes="bg-primary px-6 py-24" />
      <Portability classes="px-6 py-24" />
      <CtaBand
        title="Raise more, starting this quarter"
        subtitle="Set up the form in an afternoon. Free forever, no lock-in — and your donors stay yours."
      />
    </main>
  );
}
