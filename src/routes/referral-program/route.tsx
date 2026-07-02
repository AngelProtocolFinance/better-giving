import { href, Link } from "react-router";
import { Footer } from "#/components/footer";
import { NavDropdown } from "#/components/header";
import { DappLogo } from "#/components/image";
import { metas } from "#/helpers/seo";
import { use_user } from "#/hooks/use-user";
import type { Route } from "./+types/route";
import { Bottom } from "./bottom";
import { Faq } from "./faq";
import { Feature } from "./feature";
import { Feature2 } from "./feature-2";
import { Top } from "./top";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({
    title: "Referral Program | Better Giving",
    description:
      "Support nonprofits and earn rewards by sharing Better Giving. Join our referral program to make an impact, earn effortlessly, and grow a community of changemakers. Sign up for your unique link and start sharing today!",
  });

export default function Referrals() {
  const { user } = use_user();
  return (
    <div className="w-full grid content-start pb-16 @container">
      <div
        className="sticky -top-px z-50"
        ref={(node) => {
          if (!node) return;
          const observer = new IntersectionObserver(
            ([e]) => {
              const isIntersecting = e.intersectionRatio < 1;
              e.target.classList.toggle("bg-card", isIntersecting);
              e.target.classList.toggle("shadow-lg", isIntersecting);
            },
            { threshold: [1] }
          );
          observer.observe(node);
        }}
      >
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 xl:container xl:mx-auto px-5 py-2">
          <DappLogo classes="h-12" />
          {user !== "loading" && !user && (
            <Link
              to={{
                pathname: href("/signup"),
                search: `?redirect=${href("/dashboard/referrals")}`,
              }}
              className="btn btn-primary max-xl:text-sm text-nowrap px-6 py-2 rounded"
            >
              Sign up
            </Link>
          )}
          {user !== "loading" && user && (
            <NavDropdown auth_links={undefined} user={user} />
          )}
        </div>
      </div>

      <div className="bg-linear-to-br from-50% from-transparent to-peach/50">
        <Top />
      </div>
      <div className="bg-linear-to-bl from-peach/50 via-transparent via-50% to-lilac/50">
        <Feature className="xl:container xl:mx-auto px-10" />
      </div>
      <div className="bg-linear-to-br from-lilac/50 via-transparent via-50% to-transparent">
        <Feature2 className="xl:container xl:mx-auto px-10" />
      </div>
      <Faq classes="xl:container xl:mx-auto px-10 mt-10" />

      <Bottom classes="xl:container xl:mx-auto px-10 mx-4 my-10 xl:my-30" />
      <Footer />
    </div>
  );
}
