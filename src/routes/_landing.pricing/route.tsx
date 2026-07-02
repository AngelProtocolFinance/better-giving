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
      "Free forever for nonprofits — $0 platform fees, no contracts. Sustained by optional donor contributions at checkout, always opt-in.",
  });

export default function Page() {
  return (
    <main>
      <div className="bg-linear-to-b from-background to-accent px-6 pt-18 pb-16 text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">
          Pricing
        </p>
        <h1 className="hero-heading mt-4 max-w-3xl mx-auto">
          Free. Forever. <span className="text-primary">Really.</span>
        </h1>
        <p className="mt-4.5 text-lg text-muted-fg max-w-2xl mx-auto text-pretty">
          Not free-then-paid. Not free-with-gated-features. We're a nonprofit
          like you — we grant out 100% of donations and never take a cut.
        </p>
      </div>

      <PriceCards classes="bg-accent px-6 pt-4 pb-22" />

      <div className="px-6 py-22">
        <div className="max-w-3xl mx-auto grid gap-4.5 justify-items-center text-center">
          <h2 className="section-heading">So who pays for all this?</h2>
          <p className="text-muted-fg leading-relaxed max-w-2xl text-pretty">
            Donors do — voluntarily. At checkout, donors can add an optional
            contribution to Better Giving. It's always{" "}
            <strong className="text-fg">opt-in and never pre-selected</strong>.
            That, plus our volunteers, keeps the commons free for every
            nonprofit. And third-party processing fees? 95% of donors choose to
            cover them, so you typically receive 100% of every gift.
          </p>
          <div className="bg-accent border border-border rounded-lg px-7 py-5 max-w-xl">
            <p className="text-sm/relaxed text-muted-fg text-pretty">
              <strong className="text-fg">
                Prefer no contribution ask on your form?
              </strong>{" "}
              You can opt out of the donor-contribution model in favor of a
              simple 1.5% platform fee — your choice, always.
            </p>
          </div>
        </div>
      </div>

      <CtaBand
        title="Keep every dollar working for your mission"
        subtitle="No platform fees, no fund fees, no surprises — just free tools built by a fellow nonprofit."
      />
    </main>
  );
}
