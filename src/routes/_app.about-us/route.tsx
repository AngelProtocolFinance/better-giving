import { app_name } from "#/constants/env";
import { metas } from "#/helpers/seo";
import { CtaBand } from "#/pages/@sections/cta-band";
import type { Route } from "./+types/route";
import { Manifesto } from "./manifesto";
import { UnderdogLetter } from "./underdog-letter";
import { Values } from "./values";
import { Volunteer } from "./volunteer";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({
    title: `About Us | ${app_name}`,
    description:
      "Since 2021, we've helped 180+ nonprofits worldwide raise over $6M — with free tools, shared growth, and a simple belief: the organizations doing the work should keep the money.",
  });

export default function Page() {
  return (
    <main>
      <div className="bg-linear-to-b from-background to-accent px-6 pt-18 pb-18 text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">
          About Better Giving
        </p>
        <h1 className="hero-heading mt-4 max-w-4xl mx-auto">
          A nonprofit whose mission is your mission's money
        </h1>
        <p className="mt-4.5 text-lg text-muted-fg max-w-2xl mx-auto text-pretty">
          Since 2021, we've helped 180+ nonprofits worldwide raise over $6M —
          with free tools, shared growth, and a simple belief: the organizations
          doing the work should keep the money.
        </p>
      </div>

      <div className="bg-primary px-6 py-22">
        <div className="max-w-3xl mx-auto grid justify-items-center gap-5 text-center">
          <span
            className="text-7xl/none font-bold text-secondary h-9"
            aria-hidden
          >
            “
          </span>
          <p className="text-2xl md:text-3xl/normal font-medium text-primary-fg text-pretty">
            We believe a new model of philanthropy is possible — not based on
            scarcity and dependence, but on abundance and financial
            self-sufficiency.
          </p>
          <span className="text-primary-fg/80">
            Chauncey St. John — Founder &amp; Executive Director
          </span>
        </div>
      </div>

      <UnderdogLetter classes="px-6 py-24" />
      <Manifesto classes="bg-accent px-6 py-22" />
      <Volunteer classes="px-6 py-24" />
      <Values classes="bg-accent px-6 py-22" />

      <CtaBand
        title="Build the commons with us"
        subtitle="Join as a member, contribute as a volunteer, or just read the code. Every door is open."
      />
    </main>
  );
}
