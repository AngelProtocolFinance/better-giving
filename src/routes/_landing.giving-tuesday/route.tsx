import { app_name } from "#/constants/env";
import { metas } from "#/helpers/seo";
import { Partners } from "#/pages/@sections/partners";
import { Products } from "#/pages/@sections/products";
import { Steps } from "#/pages/@sections/steps";
import type { Route } from "./+types/route";
import { BottomCta } from "./bottom-cta";
import { Features } from "./features";
import { Hero } from "./hero";
import { Hero2 } from "./hero-2";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({
    title: `Giving Tuesday | ${app_name}`,
    description: `Why stop at one day of generosity? ${app_name} helps nonprofits grow donations sustainably with low fees, year-round yields, and every payment method in one place.`,
  });

export default function Page() {
  return (
    <>
      <Hero className="xl:container xl:mx-auto px-5" />
      <Partners classes="xl:container xl:mx-auto px-5" />
      <Hero2 className="xl:container xl:mx-auto px-5" />
      <Features classes="xl:container xl:mx-auto px-5" />
      {/* <Ctas classes="xl:container xl:mx-auto px-5" /> */}
      <Steps classes="xl:container xl:mx-auto px-5 my-24" />
      {/* <Testimonials classes="xl:container xl:mx-auto px-5 mt-24 py-24" /> */}
      <Products classes="xl:container xl:mx-auto px-5 mt-12" />
      <BottomCta className="my-20 max-w-5xl sm:max-w-6xl justify-self-center mx-4 [28rem]:mx-10" />
    </>
  );
}
