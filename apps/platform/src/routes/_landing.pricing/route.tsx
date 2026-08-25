import { app_name } from "#/constants/env";
import { metas } from "#/helpers/seo";
import { CtaBand } from "#/pages/@sections/cta-band";
import type { Route } from "./+types/route";
import { PriceCards } from "./price-cards";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({
    title: `Pricing | ${app_name}`,
    description:
      "Free forever for nonprofits. $0 platform fees, no contracts. Sustained by optional donor contributions at checkout, always opt-in.",
  });

export default function Page() {
  return (
    <main>
      <div className="bg-linear-to-b from-background to-band pt-18 pb-16 text-center">
        <div className="page">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Pricing
          </p>
          <h1 className="hero-heading mt-4 max-w-3xl mx-auto">
            Free. Forever. <span className="text-primary">Really.</span>
          </h1>
          <p className="mt-4.5 text-lg text-gray-11 max-w-2xl mx-auto text-pretty">
            Not free-then-paid. Not free-with-gated-features. We're a nonprofit
            like you. We grant out 100% of donations and never take a cut.
          </p>
        </div>
      </div>

      <PriceCards classes="bg-band pt-4 pb-22" />

      <div className="page py-22">
        <div className="max-w-3xl mx-auto grid gap-4.5 justify-items-center text-center">
          <h2 className="section-heading">So who pays for all this?</h2>
          <p className="text-gray-11 leading-relaxed max-w-2xl text-pretty">
            Donors do, voluntarily. At checkout, donors can add an optional
            contribution to Better Giving. It's always{" "}
            <strong className="text-gray-12">
              opt-in and never pre-selected
            </strong>
            . That, plus our volunteers, keeps the commons free for every
            nonprofit. And third-party processing fees? Most donors choose to
            cover them, so the vast majority of every gift reaches you.
          </p>
          <div className="bg-secondary border border-gray-6 rounded px-7 py-5 max-w-xl">
            <p className="text-sm/relaxed text-gray-11 text-pretty">
              <strong className="text-gray-12">
                Prefer no contribution ask on your form?
              </strong>{" "}
              You can opt out of the donor-contribution model in favor of a
              simple 1.5% platform fee, your choice, always.
            </p>
          </div>
        </div>
      </div>

      <CtaBand
        title="Keep every dollar working for your mission"
        subtitle="No platform fees, no fund fees, no surprises. Just free tools built by a fellow nonprofit."
      />
    </main>
  );
}
