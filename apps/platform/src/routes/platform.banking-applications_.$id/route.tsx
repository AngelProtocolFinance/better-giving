import { Outlet } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { metas } from "#/helpers/seo";
import type { Route } from "./+types/route";
import { Loaded } from "./loaded";

export { loader } from "#/pages/platform-admin/banking-applications/api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const meta: Route.MetaFunction = () =>
  metas({ title: "Banking Application Review" });
export { ErrorBoundary } from "#/components/error";
export default CacheRoute(Page);

function Page({ loaderData: bank }: Route.ComponentProps) {
  return (
    <div className="grid content-start gap-y-4 gap-x-3 px-6 py-4 md:px-10 md:py-8 w-full">
      <h3 className="font-bold text-2xl">Banking Application Review</h3>
      <Loaded {...bank} />
      {/** prompts: approve, reject, success */}
      <Outlet />
    </div>
  );
}
