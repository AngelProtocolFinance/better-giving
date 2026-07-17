import { ChevronLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { use_table } from "#/hooks/use-table";
import { EarningsHistory } from "#/pages/user-dashboard/referrals/earnings-table";
import type { Route } from "./+types/route";

export { loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();

export default CacheRoute(Page);
function Page({ loaderData: page1 }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const { node } = use_table({
    page1,
    table: (props) => <EarningsHistory {...props} />,
    classes: "mt-2",
    gen_loader: (load, next) => () => {
      const p = new URLSearchParams(params);
      if (next) p.set("next", next);
      load(`?${p.toString()}`);
    },
  });

  return (
    <div className="px-6 py-4 md:px-10 md:py-8">
      <Link
        to="../referrals"
        className="flex items-center gap-1s text-primary hover:text-primary text-sm -ml-2 mb-2"
      >
        <ChevronLeft size={18} />
        <span>Back</span>
      </Link>
      {node}
    </div>
  );
}
