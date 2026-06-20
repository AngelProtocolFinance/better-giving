import type { LinksFunction } from "react-router";
import banner from "#/assets/images/bg-banner.webp";
import { Footer } from "#/components/footer";
import { FAQ, faqs } from "#/pages/@sections/faq";
import { Partners } from "#/pages/@sections/partners";
import { Products } from "#/pages/@sections/products";
import { Steps } from "#/pages/@sections/steps";
import { Testimonials } from "#/pages/@sections/testimonials";
import { Underdog } from "#/pages/@sections/underdog";
// import { Animation } from "./animation";
// import Benefits from "./benefits";
import { Blogs } from "./blogs";
import { BottomCta } from "./bottom-cta";
import { Ctas } from "./ctas";
import { Features } from "./features";
import { Header } from "./header";
import { Hero } from "./hero";
import { Manifesto } from "./manifesto";

// import { Video } from "./video";
export { headers, loader } from "./api";
export const links: LinksFunction = () => [
  { rel: "preload", href: banner, as: "image", fetchPriority: "high" },
];

export default function Page() {
  return (
    <div className="grid pb-4">
      <Header classes="sticky z-40 -top-px" />
      <Hero />
      <Partners classes="xl:container xl:mx-auto px-5" />

      <Steps classes="xl:container xl:mx-auto px-5 mt-36" />
      <Ctas classes="xl:container xl:mx-auto mt-36" />
      {/* <Benefits /> */}
      {/* <Animation /> */}
      <Manifesto classes="mt-56 xl:container xl:mx-auto px-5" />
      <Products classes="xl:container xl:mx-auto px-5" />

      <Underdog classes="xl:container xl:mx-auto px-5 pb-20 pt-10" />
      <div className="bg-linear-to-br from-transparent to-lilac/40">
        <Features classes="xl:container xl:mx-auto px-5" />
      </div>
      {/* <Video /> */}
      <div className="bg-linear-to-bl from-lilac/40 to-peach/10">
        <Testimonials classes="xl:container xl:mx-auto px-5 py-24" />
      </div>
      <div className="bg-linear-to-br from-peach/10 from-80% to-transparent">
        <Blogs />
      </div>
      <BottomCta className="mb-20 max-w-5xl sm:max-w-6xl justify-self-center mx-4 [28rem]:mx-10" />
      <FAQ items={faqs.slice(0, 5)} classes="xl:container xl:mx-auto px-5" />
      <Footer />
    </div>
  );
}
