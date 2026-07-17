import {
  ArrowDownToLineIcon,
  ArrowLeftRightIcon,
  ArrowUpFromLineIcon,
  CircleHelp,
} from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { Cell, Pie, PieChart } from "recharts";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import {
  Arrow as HoverArrow,
  HoverCard,
  Content as HoverContent,
} from "#/components/hover-card";
import { humanize } from "@/helpers/decimal";
import type { TickerCategory } from "@/nav/interfaces";
import { group_by_category } from "@/nav/interfaces";
import type { Route } from "./+types/route";
import { SfPerf } from "./sf-perf";
import { Txs } from "./txs";

const category_colors: Record<TickerCategory | "other", string> = {
  equities: "#3b82f6",
  fixed_income: "#6b7280",
  crypto: "#f7931a",
  commodities: "#ffd700",
  cash: "#22c55e",
  other: "#64748b",
};

export { loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();

export default CacheRoute(Page);
function Page({ loaderData }: Route.ComponentProps) {
  const { bal_lock, id, composition, total_inv_value, ...btxs_page1 } =
    loaderData;
  const groups = group_by_category(composition, total_inv_value).filter(
    (g) => g.pct > 0
  );
  const pie_data = groups.map((g) => ({
    category: g.category,
    pct: g.pct,
  }));
  return (
    <div className="px-6 py-4 md:px-10 md:py-8 w-full max-w-4xl grid content-start">
      <div className="font-bold text-2xl mb-4 flex items-baseline gap-x-2">
        <h3>Investments</h3>{" "}
        <HoverCard
          tip={
            <HoverContent className="bg-popover outline outline-border text-popover-fg text-sm w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border p-4 rounded shadow-lg">
              <span className="block mb-2 font-medium">
                Portfolio composition
              </span>
              <PieChart width={150} height={150} className="mx-auto">
                <Pie
                  data={pie_data}
                  dataKey="pct"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={30}
                  outerRadius={55}
                  strokeWidth={0}
                >
                  {pie_data.map((d) => (
                    <Cell
                      key={d.category}
                      fill={
                        category_colors[d.category as TickerCategory] ??
                        category_colors.other
                      }
                    />
                  ))}
                </Pie>
              </PieChart>
              {groups.map((g) => (
                <div key={g.category} className="mb-2 last:mb-0">
                  <div className="flex items-center justify-between font-medium">
                    <span className="flex items-center gap-1.5 capitalize">
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{
                          backgroundColor:
                            category_colors[g.category as TickerCategory] ??
                            category_colors.other,
                        }}
                      />
                      {g.category.replace("_", " ")}
                    </span>
                    <span>{g.pct.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
              <HoverArrow />
            </HoverContent>
          }
        >
          <CircleHelp size={16} className="text-muted-fg ml-1" />
        </HoverCard>
      </div>
      <div className="text-xl font-semibold bg-card border p-4 rounded">
        ${humanize(bal_lock)} <SfPerf id={id} />
      </div>
      <div className="flex items-center gap-4 mt-4">
        <NavLink
          to="deposit"
          className="btn-success rounded px-4.5 py-2.5 text-sm flex items-center gap-2"
        >
          <ArrowUpFromLineIcon size={16} />
          Deposit
        </NavLink>
        <NavLink
          to="withdraw"
          className="btn-secondary rounded px-4.5 py-2.5 text-sm flex items-center gap-2"
        >
          <ArrowDownToLineIcon size={16} />
          Withdraw
        </NavLink>
        <NavLink
          to="transfer"
          className="btn-warning rounded px-4.5 py-2.5 text-sm flex items-center gap-2"
        >
          <ArrowLeftRightIcon size={16} />
          Transfer
        </NavLink>
      </div>
      <Txs page1={btxs_page1} classes="mt-8" />
      {/** prompts */}
      <Outlet />
    </div>
  );
}
