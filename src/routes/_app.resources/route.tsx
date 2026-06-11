import Fuse from "fuse.js";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { metas } from "#/helpers/seo";
import type { Route } from "./+types/route";
import {
  RESOURCE_TYPES,
  type ResourceType,
  resources,
  TYPE_LABELS,
} from "./data";
import { ResourceCard } from "./resource-card";

export const meta: Route.MetaFunction = () =>
  metas({
    title: "Resources",
    description:
      "Download whitepapers, case studies, product manuals, and templates to help your nonprofit succeed.",
  });

export { ErrorBoundary } from "#/components/error";

type Filter = ResourceType | "all";

const fuse = new Fuse(resources, {
  keys: ["name", "description"],
  threshold: 0.4,
});

export default function Resources() {
  const [query, set_query] = useState("");
  const [filter, set_filter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const searched = query ? fuse.search(query).map((r) => r.item) : resources;
    if (filter === "all") return searched;
    return searched.filter((r) => r.type === filter);
  }, [query, filter]);

  return (
    <div className="w-full grid content-start pb-16">
      {/* hero */}
      <section className="bg-muted py-16">
        <div className="xl:container xl:mx-auto px-5 grid gap-4 justify-items-center text-center">
          <h1 className="text-3xl sm:text-4xl font-bold">Resource Hub</h1>
          <p className="text-muted-fg max-w-xl">
            Download whitepapers, case studies, product manuals, and templates
            to power your nonprofit's growth.
          </p>
          <div className="relative w-full max-w-md mt-4">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg"
            />
            <input
              type="text"
              placeholder="Search resources..."
              value={query}
              onChange={(e) => set_query(e.target.value)}
              className="field-input py-2.5 pl-10 pr-4 bg-card"
            />
          </div>
        </div>
      </section>

      {/* filters + grid */}
      <div className="xl:container xl:mx-auto px-5 mt-8 grid gap-6">
        {/* filter tabs */}
        <div className="flex flex-wrap gap-2">
          <FilterTab
            active={filter === "all"}
            onClick={() => set_filter("all")}
          >
            All Resources
          </FilterTab>
          {RESOURCE_TYPES.map((t) => (
            <FilterTab
              key={t}
              active={filter === t}
              onClick={() => set_filter(t)}
            >
              {TYPE_LABELS[t]}
            </FilterTab>
          ))}
        </div>

        {/* results */}
        {filtered.length === 0 ? (
          <p className="text-center text-muted-fg py-12">No resources found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((r) => (
              <ResourceCard key={r.name} resource={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active ? "bg-primary text-primary-fg" : "bg-muted hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
