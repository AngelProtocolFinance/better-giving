import { Plus } from "lucide-react";
import { NavLink } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { admin_page_meta } from "#/routes/admin.$id/page-meta";
import type { Route } from "./+types/route";
import { List } from "./list";

export { delete_action as action, members as loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export { ErrorBoundary } from "#/components/error";
export const meta: Route.MetaFunction = ({ matches }) =>
  admin_page_meta("Manage Members", matches);

export default CacheRoute(Page);

function Page({ loaderData: data }: Route.ComponentProps) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center content-start gap-y-6 @lg:gap-y-8 px-6 py-4 md:px-10 md:py-8 max-w-[1400px]">
      <h1 className="text-3xl font-bold">Manage Members</h1>
      <NavLink className="btn btn-primary gap-2" to="add">
        <Plus className="icon-md" />
        <span>Invite user</span>
      </NavLink>
      <List {...data} />
    </div>
  );
}
