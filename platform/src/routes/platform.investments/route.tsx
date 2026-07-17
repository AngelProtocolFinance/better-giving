import { format } from "date-fns";
import { Link, NavLink, Outlet } from "react-router";
import {
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { NpoName } from "#/components/npo-name";
import { metas } from "#/helpers/seo";
import { ticker_colors } from "#/pages/platform-admin/investments/common";
import { HistoryTable } from "#/pages/platform-admin/investments/history-table";
import { humanize } from "@/helpers/decimal";
import type { Route } from "./+types/route";

export { loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const meta: Route.MetaFunction = () => metas({ title: "Investments" });
function top_holders_fn(holders: Record<string, number>) {
  return Object.entries(holders)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
}

export default CacheRoute(Page);
function Page({ loaderData }: Route.ComponentProps) {
  const { ltd, logs, recent_logs } = loaderData;
  const pie_data = Object.values(ltd.composition)
    .map((x) => ({
      ...x,
      pct: (x.value / ltd.value) * 100,
    }))
    .sort((a, b) => b.pct - a.pct);
  const line_data = logs.toReversed().map((x) => {
    const { date, units, price } = x;
    return {
      date: format(new Date(date), "yyyy-MM-dd"),
      units,
      price,
    };
  });
  const num_holders = Object.keys(ltd.holders).length;
  const top_holders = top_holders_fn(ltd.holders);

  return (
    <div className="px-6 py-4 md:px-10 md:py-8 w-full max-w-4xl grid content-start">
      <h3 className="font-bold text-2xl mb-4">Investments</h3>
      <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-4 gap-6 mb-8">
        <div>
          <p className="text-muted-fg text-sm mb-2">Portfolio Value</p>
          <p className="text-3xl font-bold">${humanize(ltd.value)}</p>
        </div>
        <div>
          <p className="text-muted-fg text-sm mb-2">Portfolio Units</p>
          <p className="text-3xl font-bold">{humanize(ltd.units)}</p>
        </div>
      </div>

      <h4 className="font-bold text-lg mb-4 mt-8">NAV Price & Units</h4>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={line_data}
          margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
        >
          <Legend wrapperStyle={{ fontSize: 14, paddingTop: 10 }} />
          <XAxis dataKey="date" tick={{ fontSize: 12, dy: 4 }} />
          <YAxis
            yAxisId="left"
            orientation="left"
            stroke="#2d89c8"
            tick={{ fontSize: 12, dx: -4 }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#10b981"
            tick={{ fontSize: 12, dx: 4 }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="units"
            stroke="#2d89c8"
            name="Units"
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="price"
            stroke="#10b981"
            name="Price"
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
          <RechartsTooltip
            contentStyle={{ fontSize: 12 }}
            formatter={(val, name) => [`${humanize(val as number)}`, name]}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-between mt-8 mb-4">
        <h4 className="text-lg">Recent changes</h4>
        {recent_logs.next && (
          <Link
            to="nav-history"
            className="text-sm text-primary hover:text-primary"
          >
            See All
          </Link>
        )}
      </div>
      {recent_logs.items.length > 0 ? (
        <HistoryTable items={recent_logs.items} />
      ) : (
        <p className="text-muted-fg py-1">No changes yet</p>
      )}
      <div className="flex items-center gap-x-2 mt-8">
        <h4 className="font-bold text-lg">Portfolio Composition</h4>
        <NavLink
          replace
          preventScrollReset
          to="rebalance"
          className="btn-primary text-xs px-2 py-1 roundes-xs"
        >
          Rebalance
        </NavLink>
        <NavLink
          replace
          preventScrollReset
          to="log-dividends"
          className="btn-success text-xs px-2 py-1 roundes-xs"
        >
          Dividend
        </NavLink>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={pie_data}
            dataKey="value"
            nameKey="id"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            label={({ name }) => name}
          >
            {pie_data.map((p) => (
              <Cell
                key={p.id}
                fill={ticker_colors[p.id] || "#64748b"} // default gray
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
        <table className="table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Units</th>
              <th>Price</th>
              <th>Price Date</th>
              <th>Value</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {pie_data.map((t) => (
              <tr key={t.id} className="text-sm">
                <td
                  style={{ color: ticker_colors[t.id] || "#64748b" }}
                  className="font-bold"
                >
                  {t.id}
                </td>
                <td className="text-right">{humanize(t.qty)}</td>
                <td className="text-right">${humanize(t.price)}</td>
                <td className="text-right">
                  {t.price_date ? format(new Date(t.price_date), "PP") : "-"}
                </td>
                <td className="text-right font-bold">${humanize(t.value)}</td>
                <td className="text-right">{humanize(t.pct)}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h5 className="font-bold text-md mt-8 mb-2">
          Top Holders{" "}
          <span className="text-sm text-muted-fg">( of {num_holders} )</span>
        </h5>
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
          <table className="table">
            <thead>
              <tr>
                <th>Holder</th>
                <th>Units</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {top_holders.map(([holder, units]) => (
                <tr key={holder} className="text-sm">
                  <td>
                    <NpoName id={holder} />
                  </td>
                  <td className="text-right">{humanize(units)}</td>
                  <td className="text-right font-bold">
                    ${humanize(units * ltd.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Outlet />
    </div>
  );
}
