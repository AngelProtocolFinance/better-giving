import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { metas } from "#/helpers/seo";
import type { Route } from "./+types/route";
import Loaded from "./loaded";

export const meta: Route.MetaFunction = ({ loaderData: d }) => {
  if (!d?.reg) return [];
  return metas({
    title: `Application Review - ${d.reg.o_name}`,
  });
};

export { loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export { ErrorBoundary } from "#/components/error";

export default CacheRoute(Page);
function Page({ loaderData }: Route.ComponentProps) {
  const { reg, wacc } = loaderData;

  return (
    <div className="grid content-start gap-y-4 gap-x-3 px-6 py-4 md:px-10 md:py-8 w-full">
      <h3 className="font-bold text-2xl">Application Review</h3>
      <Loaded {...reg} bank={wacc} />
    </div>
  );
}
