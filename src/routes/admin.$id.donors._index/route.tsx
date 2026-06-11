import { useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { use_table } from "#/hooks/use-table";
import { KpiCard } from "../admin.$id.donors/kpi-card";
import type { Route } from "./+types/route";
import { DonorsTable } from "./table";

export { ErrorBoundary } from "#/components/error";
export { loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();

export default CacheRoute(Page);

function Page({ loaderData }: Route.ComponentProps) {
  const { page, summary, sort, dir } = loaderData;
  const [search] = useSearchParams();

  const { node } = use_table({
    filter_key: `${sort}:${dir}`,
    table: (props) => <DonorsTable {...props} />,
    page1: page,
    unwrap: (d: typeof loaderData) => d.page,
    gen_loader: (load, next) => () => {
      const p = new URLSearchParams(search);
      if (next) p.set("next", next);
      // ?index targets the _index loader; without it RR's getTargetMatch
      // picks the deepest path-contributing match (the parent layout).
      p.append("index", "");
      load(`?${p.toString()}`);
    },
  });

  const delta_pct =
    summary.new_this_month_count === 0 || summary.new_prev_month_count === 0
      ? null
      : Math.round(
          ((summary.new_this_month_count - summary.new_prev_month_count) /
            summary.new_prev_month_count) *
            100
        );
  const delta =
    summary.new_this_month_count === 0
      ? undefined
      : delta_pct === null
        ? "First month of new-donor tracking"
        : `${delta_pct >= 0 ? "+" : ""}${delta_pct}% vs last month`;

  const added_this_month = summary.trend_new.slice(-1)[0] ?? 0;

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard
          label="Total donors"
          value={summary.total_donors.toLocaleString("en-US")}
          delta={
            added_this_month > 0
              ? `${added_this_month} added this month`
              : undefined
          }
          data={summary.trend_total}
        />
        <KpiCard
          label="New donors this month"
          value={summary.new_this_month_count.toLocaleString("en-US")}
          delta={delta}
          delta_tone={
            delta_pct === null
              ? "neutral"
              : delta_pct > 0
                ? "positive"
                : delta_pct < 0
                  ? "negative"
                  : "neutral"
          }
        />
      </div>
      {node}
    </div>
  );
}
