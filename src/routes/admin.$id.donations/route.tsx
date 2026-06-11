import { Outlet, useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { use_table } from "#/hooks/use-table";
import { use_admin_data } from "#/pages/admin/use-admin-data";
import { default_allocation } from "@/constants/common";
import type { Route } from "./+types/route";
import { Allocation } from "./allocation";
import { DonationsTable } from "./donations-table";

export { ErrorBoundary } from "#/components/error";
export { action, loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();

export default CacheRoute(Page);
function Page({ loaderData: page1 }: Route.ComponentProps) {
  const [search] = useSearchParams();
  const { node } = use_table({
    table: (props) => <DonationsTable {...props} />,
    page1,
    gen_loader: (load, next) => () => {
      const p = new URLSearchParams(search);
      if (next) p.set("next", next);
      load(`?${p.toString()}`);
    },
  });
  const data = use_admin_data();
  return (
    <div className="px-6 py-4 md:px-10 md:py-8">
      <h2 className="text-3xl font-bold mb-4">Donations</h2>
      <Allocation
        classes="mb-4"
        allocation={data?.endow.allocation ?? default_allocation}
      />
      {node}
      {/** edit allocation */}
      <Outlet />
    </div>
  );
}
