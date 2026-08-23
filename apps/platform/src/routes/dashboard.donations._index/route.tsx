import { Outlet, useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { use_table } from "#/hooks/use-table";
import type { TStatus } from "@/donations";
import type { Route } from "./+types/route";
import { Table } from "./table";

export { loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();

export { ErrorBoundary } from "#/components/error";

export default CacheRoute(Donations);
function Donations({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const { user, ...page1 } = loaderData;
  // set by the layout above; the table needs it to tell an account with no
  // donations from a filter that matched none.
  const status = params.get("status") as TStatus | null;
  const { node } = use_table({
    table: (props) => <Table {...props} status={status ?? undefined} />,
    classes: "mt-2",
    page1,
    gen_loader: (load, next) => () => {
      const copy = new URLSearchParams(params);
      if (next) copy.set("next", next.toString());
      load(`?index&${copy.toString()}`);
    },
  });

  return (
    <div className="table-scroll">
      <Outlet />
      {node}
    </div>
  );
}
