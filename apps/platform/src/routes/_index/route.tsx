import type { LinksFunction } from "react-router";
import donation_form from "#/assets/images/donation-form.png";
import { AnnouncementBanner } from "#/components/chrome/announcement-banner";
import { PublicFooter, PublicHeader } from "#/components/chrome/public-chrome";
import { app_name, base_url } from "#/constants/env";
import { socials } from "#/constants/urls";
import { metas } from "#/helpers/seo";
import { CtaBand } from "#/pages/@sections/cta-band";
import { FAQ } from "#/pages/@sections/faq";
import { PartnersStrip } from "#/pages/@sections/partners/strip";
import { TrustBar } from "#/pages/@sections/trust-bar";
import type { Route } from "./+types/route";
import { home_faqs } from "./faqs";
import { GrowFunds } from "./grow-funds";
import { Hero } from "./hero";
import { OpenSource } from "./open-source";
import { OwnGrow } from "./own-grow";
import { Pillars } from "./pillars";
import { Steps } from "./steps";
import { Testimonials } from "./testimonials";

export { headers, loader } from "./api";

const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: app_name,
  url: base_url,
  logo: `${base_url}/logo.png`,
  sameAs: [
    socials.linkedin,
    socials.facebook,
    socials.x,
    socials.youtube,
    socials.instagram,
  ],
};

const website = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: app_name,
  url: base_url,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${base_url}/marketplace?query={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

export const meta: Route.MetaFunction = () =>
  metas({ jsonld: [organization, website] });

export const links: LinksFunction = () => [
  { rel: "preload", href: donation_form, as: "image", fetchPriority: "high" },
];

export default function Page() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_1fr_auto] min-h-dvh">
      {/* "/" is always marketing chrome and is never the post the banner links
          to, so it needs no gate. */}
      <AnnouncementBanner />
      <PublicHeader classes="sticky z-40 -top-px" />
      <main>
        <Hero />
        <TrustBar classes="border-y border-border py-7" />
        <PartnersStrip classes="border-b border-secondary" />
        <Steps classes="py-22" />
        <OwnGrow classes="bg-accent py-24" />
        <Pillars classes="py-24" />
        <GrowFunds classes="bg-accent py-24" />
        <OpenSource classes="bg-primary py-24" />
        <Testimonials classes="py-24" />
        <div className="bg-accent pt-22 pb-48">
          <div className="page-narrow">
            <FAQ items={home_faqs} classes="max-w-3xl mx-auto" />
          </div>
        </div>
        <CtaBand
          title="Join the commons. It's free, forever."
          subtitle="Set up your donation form in minutes. No fees, no contracts, no lock-in. Just more of every dollar working for your mission."
        />
      </main>
      <PublicFooter />
    </div>
  );
}
