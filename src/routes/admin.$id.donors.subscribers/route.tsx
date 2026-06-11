import { useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { use_table } from "#/hooks/use-table";
import type { Route } from "./+types/route";
import { SubscribersKpis } from "./summary";
import { SubscribersTable } from "./table";

export { ErrorBoundary } from "#/components/error";
export { loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();

export default CacheRoute(Page);

function Page({ loaderData }: Route.ComponentProps) {
  const { page, summary, trends } = loaderData;
  const [search] = useSearchParams();

  const { node } = use_table({
    table: (props) => <SubscribersTable {...props} />,
    page1: page,
    unwrap: (d: typeof loaderData) => d.page,
    gen_loader: (load, next) => () => {
      const p = new URLSearchParams(search);
      if (next) p.set("next", next);
      load(`?${p.toString()}`);
    },
  });

  return (
    <div>
      <SubscribersKpis summary={summary} trends={trends} />
      <div className="mt-6">{node}</div>
    </div>
  );
}
