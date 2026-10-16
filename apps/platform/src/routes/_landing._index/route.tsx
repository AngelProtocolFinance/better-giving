import type { LinksFunction } from "react-router";
import donation_form from "#/assets/images/donation-form.png";
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
    <main>
      <Hero />
      <div className="pt-16 md:pt-20 pb-8 md:pb-12">
        <TrustBar classes="pb-10 md:pb-12" />
        <PartnersStrip />
      </div>
      <Steps classes="bg-band py-24 md:py-32" />
      <OwnGrow classes="py-24 md:py-32" />
      <Pillars classes="bg-band py-24 md:py-32" />
      <GrowFunds classes="py-24 md:py-32" />
      <OpenSource classes="surface-deep py-24 md:py-32" />
      <Testimonials classes="py-24 md:py-32" />
      <div className="bg-band py-24 md:py-32">
        <div className="page">
          <FAQ items={home_faqs} layout="split" />
        </div>
      </div>
      <CtaBand
        title="Join the commons. It's free, forever."
        subtitle="Set up your donation form in minutes. No fees, no contracts, no lock-in. Just more of every dollar working for your mission."
      />
    </main>
  );
}
