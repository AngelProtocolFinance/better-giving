import { Outlet, useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { use_table } from "#/hooks/use-table";
import type { Route } from "./+types/route";
import { Table } from "./table";

export { loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();

export { ErrorBoundary } from "#/components/error";

export default CacheRoute(Donations);
function Donations({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const { user, ...page1 } = loaderData;
  const { node } = use_table({
    table: (props) => <Table {...props} />,
    classes: "mt-2",
    page1,
    gen_loader: (load, next) => () => {
      const copy = new URLSearchParams(params);
      if (next) copy.set("next", next.toString());
      load(`?index&${copy.toString()}`);
    },
  });

  return (
    <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
      <Outlet />
      {node}
    </div>
  );
}
