import { app_name } from "#/constants/env";
import { metas } from "#/helpers/seo";
import { CtaBand } from "#/pages/@sections/cta-band";
import type { Route } from "./+types/route";
import { AllocationGovernance } from "./allocation-governance";
import { GrowPlaces } from "./grow-places";
import { Hero } from "./hero";
import { SplitSteps } from "./split-steps";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({
    title: `Fund Management | ${app_name}`,
    description:
      "Grant, save, or invest each donation your way. Returns vary, and past performance isn't a guarantee.",
  });

export default function Page() {
  return (
    <main>
      <Hero />
      <GrowPlaces classes="bg-band py-24 md:py-32" />
      <AllocationGovernance classes="py-24 md:py-32" />
      <SplitSteps classes="bg-band py-24 md:py-32" />
      <CtaBand
        title="Start building your reserve today"
        subtitle="Grant, save, or invest each donation. Returns vary, and past performance isn't a guarantee."
      />
    </main>
  );
}
