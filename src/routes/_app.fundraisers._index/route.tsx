import { Search } from "lucide-react";
import type { ChangeEventHandler } from "react";
import { href, NavLink, useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { metas } from "#/helpers/seo";
import { use_debounce } from "#/hooks/use-debounce";
import { use_table } from "#/hooks/use-table";

import type { Route } from "./+types/route";
import { Cards } from "./cards";
import Hero from "./hero";
import hero from "./hero.webp?url";

export { headers, loader } from "./funds-api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();

export const meta: Route.MetaFunction = () =>
  metas({
    image: hero,
    title: "Fundraisers",
    description:
      "Fundraisers that Support One or Several Nonprofits. Every Donation goes where you want it to.",
  });

export { ErrorBoundary } from "#/components/error";
export default CacheRoute(Funds);
function Funds({ loaderData: page1 }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const { node, load } = use_table({
    id: "funds",
    page1,
    table: (x) => <Cards {...x} />,
    classes: "mt-4",
    gen_loader: (l, next) => () => {
      const p = new URLSearchParams(params);
      if (next) p.set("page", next.toString());
      l(`?index&${p.toString()}`);
    },
  });

  const onChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const n = new URLSearchParams(params);
    n.set("query", e.target.value);
    load(`?index&${n.toString()}`);
  };

  const debounced_change = use_debounce(onChange, 500);

  return (
    <div>
      <div className="py-6 bg-primary">
        <Hero classes="grid isolate xl:container xl:mx-auto px-5" />
      </div>
      <div className="xl:container xl:mx-auto px-5 mt-8 pb-8">
        <div className="grid grid-cols-[1fr_auto] gap-x-2">
          <div className="relative">
            <Search
              size={20}
              className="ml-2 absolute top-1/2 -translate-y-1/2 left-2"
            />
            <input
              type="search"
              name="query"
              onChange={debounced_change}
              className="field-input rounded h-full pl-12"
              placeholder="Search fundraiser"
            />
          </div>
          <NavLink
            to={href("/fundraisers/new")}
            className="btn btn-primary text-sm rounded px-6"
          >
            Create Fundraiser
          </NavLink>
        </div>

        {node}
      </div>
    </div>
  );
}
