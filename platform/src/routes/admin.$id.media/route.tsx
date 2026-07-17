import { Plus } from "lucide-react";
import { NavLink, Outlet, useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { Select } from "#/components/selector";
import { use_table } from "#/hooks/use-table";
import { List, NoVideo } from "#/pages/admin/media/list";
import type { Route } from "./+types/route";

export { loader, videos_action as action } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export { ErrorBoundary } from "#/components/error";
export default CacheRoute(Media);

type Filter = "all" | "featured";
const filter_labels: Record<Filter, string> = {
  all: "All",
  featured: "Featured",
};

function Media({ loaderData: page1 }: Route.ComponentProps) {
  const [search, setSearch] = useSearchParams();
  const filter: Filter = search.get("featured") === "1" ? "featured" : "all";

  const { node } = use_table({
    page1,
    table: (p) =>
      p.items.length === 0 ? <NoVideo classes={p.classes} /> : <List {...p} />,
    classes: "mt-6",
    gen_loader: (load, next) => () => {
      const p = new URLSearchParams(search);
      if (next) p.set("nextPageKey", next);
      load(`?${p.toString()}`);
    },
  });

  return (
    <div className="grid content-start gap-y-6 @lg:gap-y-8 px-6 py-4 md:px-10 md:py-8">
      <h3 className="text-3xl">Media</h3>
      <div className="grid gap-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h4 className="text-2xl">Videos</h4>
            <Select
              value={filter}
              onChange={(v) => {
                const p = new URLSearchParams();
                if (v === "featured") p.set("featured", "1");
                setSearch(p);
              }}
              options={["all", "featured"] satisfies Filter[]}
              option_disp={(v) => filter_labels[v]}
              classes={{
                button: "text-sm py-1.5 px-3",
                options: "text-sm min-w-28",
              }}
            />
          </div>
          <NavLink
            to="new"
            className="btn-secondary btn text-sm px-8 py-2 gap-1"
          >
            <Plus size={16} />
            <span>Add Video</span>
          </NavLink>
        </div>
        {node}
      </div>
      {/** video editor modal */}
      <Outlet />
    </div>
  );
}
