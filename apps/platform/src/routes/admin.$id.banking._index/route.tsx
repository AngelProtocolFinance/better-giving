import { Plus } from "lucide-react";
import { NavLink } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { Info } from "#/components/status";
import type { Route } from "./+types/route";
import { Table } from "./table";

export { loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();

export { ErrorBoundary } from "#/components/error";
export default CacheRoute(Page);
function Page({ loaderData }: Route.ComponentProps) {
  const { methods } = loaderData;

  return (
    <div className="px-6 py-4 md:px-10 md:py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-left text-lg uppercase">Current Banking Details</h1>
        <NavLink to="new" className="btn btn-success pl-2 pr-4 py-2 text-xs">
          <Plus className="mr-2" size={16} />
          <span>New</span>
        </NavLink>
      </div>

      {methods.length === 0 ? (
        <Info>No payout methods found</Info>
      ) : (
        <div className="grid col-span-full overflow-x-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
          <Table methods={methods} />
        </div>
      )}
    </div>
  );
}
