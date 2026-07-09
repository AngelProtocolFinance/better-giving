import type { LinksFunction } from "react-router";
import donation_form from "#/assets/images/donation-form.png";
import { PublicFooter, PublicHeader } from "#/components/chrome/public-chrome";
import { CtaBand } from "#/pages/@sections/cta-band";
import { FAQ } from "#/pages/@sections/faq";
import { PartnersStrip } from "#/pages/@sections/partners/strip";
import { home_faqs } from "./faqs";
import { GrowFunds } from "./grow-funds";
import { Hero } from "./hero";
import { OpenSource } from "./open-source";
import { OwnGrow } from "./own-grow";
import { Pillars } from "./pillars";
import { Steps } from "./steps";
import { Testimonials } from "./testimonials";
import { TrustBar } from "./trust-bar";

export { headers, loader } from "./api";

export const links: LinksFunction = () => [
  { rel: "preload", href: donation_form, as: "image", fetchPriority: "high" },
];

export default function Page() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto] min-h-dvh">
      <PublicHeader classes="sticky z-40 -top-px" />
      <main>
        <Hero />
        <TrustBar />
        <PartnersStrip classes="border-b border-secondary" />
        <Steps classes="px-6 py-22" />
        <OwnGrow classes="bg-accent px-6 py-24" />
        <Pillars classes="px-6 py-24" />
        <GrowFunds classes="bg-accent px-6 py-24" />
        <OpenSource classes="bg-primary px-6 py-24" />
        <Testimonials classes="px-6 py-24" />
        <div className="bg-accent px-6 pt-22">
          <FAQ items={home_faqs} classes="max-w-3xl mx-auto" />
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
