import { app_name } from "#/constants/env";
import { metas } from "#/helpers/seo";
import { CtaBand } from "#/pages/@sections/cta-band";
import type { Route } from "./+types/route";
import { Donate } from "./donate";
import { FounderQuote } from "./founder-quote";
import { Hero } from "./hero";
import { Manifesto } from "./manifesto";
import { UnderdogLetter } from "./underdog-letter";
import { Values } from "./values";
import { Volunteer } from "./volunteer";

// origin only — the donation band's post-payment return url must land on the
// host the donor is on (preview/dev/prod), not the build-time VITE_BASE_URL.
// user-independent by design: no session, no cookies, nothing per-visitor, so
// the s-maxage below still holds.
export const loader = ({ request }: Route.LoaderArgs) => ({
  base_url: new URL(request.url).origin,
});

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({
    title: `About Us | ${app_name}`,
    description:
      "Since 2021, Better Giving has offered donation forms, savings, and fund growth tools, with a simple belief: the organizations doing the work should keep the money.",
  });

export default function Page({ loaderData }: Route.ComponentProps) {
  return (
    <main>
      <Hero />
      <FounderQuote classes="surface-deep py-24 md:py-32" />
      <UnderdogLetter classes="py-24 md:py-32" />
      <Manifesto classes="bg-band py-24 md:py-32" />
      <Volunteer classes="py-24 md:py-32" />
      <Values classes="bg-band py-24 md:py-32" />

      <CtaBand
        title="Build the commons with us"
        subtitle="Register online, or read the code."
      />

      <Donate base_url={loaderData.base_url} classes="bg-band py-24 md:py-32" />
    </main>
  );
}
