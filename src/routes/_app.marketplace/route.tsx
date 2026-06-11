import { Outlet, useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { safeParse } from "valibot";
import { get_npos } from "#/.server/npos";
import { Info } from "#/components/status";
import { metas } from "#/helpers/seo";
import { use_table } from "#/hooks/use-table";
import { resp, search } from "@/helpers/https";
import { npos_search } from "@/npo/schema";
import type { Route } from "./+types/route";
import { ActiveFilters } from "./active-filters";
import { Cards } from "./cards";
import { Hero } from "./hero";
import hero from "./hero.webp?url";
import { Toolbar } from "./toolbar";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const p_s = safeParse(npos_search, search(request));
  if (p_s.issues) throw resp.status(400, p_s.issues[0].message);
  const { published, claimed, ...p } = p_s.output;
  const page = await get_npos({ ...p, claimed: [true], published: [true] });
  return page;
};

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();

export const meta: Route.MetaFunction = () =>
  metas({
    title: "Marketplace",
    description:
      "Find and support charities, nonprofits, universities, and faith-based organizations—all in one place.",
    image: hero,
  });

export { ErrorBoundary } from "#/components/error";
export default CacheRoute(Page);
function Page({ loaderData: page1 }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const { node } = use_table({
    id: "marketplace",
    page1,
    table: (props) =>
      props.items.length === 0 ? (
        <Info classes={props.classes}>No organisations found</Info>
      ) : (
        <Cards {...props} />
      ),
    gen_loader: (load, next) => () => {
      const p = new URLSearchParams(params);
      if (next) p.set("page", next.toString());
      load(`?${p.toString()}`);
    },
  });
  return (
    <div className="w-full grid content-start pb-16">
      <Hero classes="grid isolate mt-8 xl:container xl:mx-auto px-5" />
      <div className="grid gap-y-4 content-start xl:container xl:mx-auto px-5 min-h-screen">
        <Toolbar classes="mt-10" />
        <ActiveFilters />
        {node}
      </div>
      <Outlet />
    </div>
  );
}
