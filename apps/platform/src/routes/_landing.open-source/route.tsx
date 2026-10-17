import { app_name } from "#/constants/env";
import { metas } from "#/helpers/seo";
import { CtaBand } from "#/pages/@sections/cta-band";
import type { Route } from "./+types/route";
import { Commons } from "./commons";
import { Hero } from "./hero";
import { Why } from "./why";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({
    title: `Open Source | ${app_name}`,
    description:
      "The Better Giving platform is public code. Read how donations are processed, and contribute code or docs if you want to help.",
  });

export default function Page() {
  return (
    <main>
      <Hero classes="surface-deep" />
      <Why classes="py-24 md:py-32" />
      <Commons classes="bg-band py-24 md:py-32" />
      <CtaBand
        title="Read the code. Then join the managed platform."
        subtitle="The repository is public. Joining means the managed platform: no platform fee while the optional donor contribution stays on."
      />
    </main>
  );
}
