import { app_name } from "#/constants/env";
import { metas } from "#/helpers/seo";
import { CtaBand } from "#/pages/@sections/cta-band";
import type { Route } from "./+types/route";
import { Commons } from "./commons";
import { Hero } from "./hero";
import { TwoPaths } from "./two-paths";
import { Why } from "./why";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({
    title: `Open Source | ${app_name}`,
    description:
      "Every part of Better Giving is public code: verify how donations are handled, self-host the form, and help keep the commons free.",
  });

export default function Page() {
  return (
    <main>
      <Hero classes="surface-deep" />
      <Why classes="py-24 md:py-32" />
      <TwoPaths classes="bg-band py-24 md:py-32" />
      <Commons classes="py-24 md:py-32" />
      <CtaBand
        title="Verify us. Then join us."
        subtitle="Read the code, kick the tires, and set up your form in an afternoon. Free forever either way."
      />
    </main>
  );
}
