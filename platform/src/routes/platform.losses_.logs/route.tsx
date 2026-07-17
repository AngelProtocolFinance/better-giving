import { ChevronLeftIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { metas } from "#/helpers/seo";
import { use_table } from "#/hooks/use-table";
import { LogsTable } from "#/pages/platform-admin/losses/logs-table";
import type { Route } from "./+types/route";

export { loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const meta: Route.MetaFunction = () => metas({ title: "Losses - Logs" });

export default CacheRoute(Page);
function Page({ loaderData: page1 }: Route.ComponentProps) {
  const [search] = useSearchParams();
  const { node } = use_table({
    table: (x) => <LogsTable {...x} />,
    page1,
    classes: "mt-4",
    gen_loader: (load, next) => () => {
      const p = new URLSearchParams(search);
      if (next) p.set("next", next);
      load(`?${p.toString()}`);
    },
  });

  return (
    <div className="px-6 py-4 md:px-10 md:py-8">
      <Link
        to={".."}
        className="flex items-center gap-1 mb-4 text-primary hover:text-primary/80 text-sm"
      >
        <ChevronLeftIcon size={18} />
        <span>Back</span>
      </Link>
      {node}
    </div>
  );
}
