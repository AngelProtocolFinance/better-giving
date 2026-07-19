import { href, Link } from "react-router";
import laira_presentation from "#/assets/laira/laira-presentation-hd.webp";
import { ExtLink } from "#/components/ext-link";
import { Image } from "#/components/image";
import { app_name } from "#/constants/env";
import { BOOK_A_DEMO } from "#/constants/urls";
import { metas } from "#/helpers/seo";
import { CtaBand } from "#/pages/@sections/cta-band";
import type { Route } from "./+types/route";
import { AllocationGovernance } from "./allocation-governance";
import { GrowPlaces } from "./grow-places";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({
    title: `Fund Management | ${app_name}`,
    description:
      "Grant, save, or invest each donation your way. Free high-yield savings and a Sustainability Fund with no setup, AUM, or performance fees.",
  });

const split_steps = [
  {
    n: "1",
    title: "Choose your split",
    body: "e.g. 80% granted to your bank, 15% savings, 5% Sustainability Fund. Whatever fits your needs.",
  },
  {
    n: "2",
    title: "Donations route automatically",
    body: "Every gift (card, stock, crypto, DAF) follows your split with no extra admin.",
  },
  {
    n: "3",
    title: "Watch reserves build",
    body: "Track balances in your dashboard and withdraw anytime. Payouts within 5 working days.",
  },
] as const;

export default function Page() {
  return (
    <main>
      <div className="bg-linear-to-b from-background to-accent px-6 pt-16 pb-18">
        <div className="max-w-6xl mx-auto grid gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">
          <div className="grid gap-5 justify-items-start">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">
              Fund Management
            </p>
            <h1 className="hero-heading">
              This quarter's gifts, next decade's reserves
            </h1>
            <p className="text-lg/relaxed text-muted-fg max-w-lg text-pretty">
              Choose what share of each donation is granted to your bank, held
              in high-yield savings, or invested in the Sustainability Fund.
              Change the split anytime. Pay nothing, ever.
            </p>
            <div className="flex flex-wrap items-center gap-3.5 mt-1.5">
              <Link
                to={href("/register/welcome")}
                className="btn btn-primary px-7 py-3.5 shadow-lg shadow-primary/25"
              >
                Join free forever
              </Link>
              <ExtLink
                href={BOOK_A_DEMO}
                className="btn btn-secondary px-6 py-3.5"
              >
                Book a demo
              </ExtLink>
            </div>
            <p className="text-sm text-muted-fg">
              No setup, AUM, or performance fees. 100% of growth is yours.
            </p>
          </div>
          <Image
            src={laira_presentation}
            width={420}
            alt="Laira presenting a growth chart"
            className="justify-self-center max-w-full"
          />
        </div>
      </div>

      <GrowPlaces classes="px-6 py-22" />
      <AllocationGovernance classes="bg-accent px-6 py-24" />

      <section className="px-6 py-22" aria-labelledby="split-steps-heading">
        <div className="max-w-6xl mx-auto">
          <h2
            id="split-steps-heading"
            className="section-heading text-center max-w-2xl mx-auto"
          >
            Set your split once. We handle the rest.
          </h2>
          <div className="grid gap-6 md:grid-cols-3 mt-12">
            {split_steps.map((s) => (
              <div
                key={s.n}
                className="grid gap-2.5 justify-items-center text-center content-start"
              >
                <span
                  className="size-13 rounded-full bg-secondary text-secondary-fg grid place-items-center text-xl font-bold"
                  aria-hidden
                >
                  {s.n}
                </span>
                <span className="text-xl font-bold">{s.title}</span>
                <p className="text-sm/relaxed text-muted-fg max-w-75">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Start building your reserve today"
        subtitle="Free savings and fund management. No setup, AUM, or performance fees. 100% of growth goes to your mission."
      />
    </main>
  );
}
