import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import type { Route } from "./+types/route";
import { List } from "./list";

export { delete_action as action, members as loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export { ErrorBoundary } from "#/components/error";
export default CacheRoute(Page);

function Page({ loaderData: data }: Route.ComponentProps) {
  return (
    <div className="grid content-start gap-y-6 @lg:gap-y-8 px-6 py-4 md:px-10 md:py-8">
      <h1 className="text-3xl font-bold">Manage Members</h1>
      <List {...data} />
    </div>
  );
}
