import { format } from "date-fns";
import { PlusIcon } from "lucide-react";
import { NavLink, Outlet, useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { metas } from "#/helpers/seo";
import { via_name } from "@/donations/helpers";
import { humanize } from "@/helpers/decimal";
import type { Route } from "./+types/route";

export { loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const meta: Route.MetaFunction = () =>
  metas({ title: "Settle Donations" });

export default CacheRoute(Page);
function Page({ loaderData }: Route.ComponentProps) {
  const { settlements, has_more, next_cursor } = loaderData;
  const [search_params] = useSearchParams();
  const prev_cursor = search_params.get("cursor");

  return (
    <div className="px-6 py-4 md:px-10 md:py-8 w-full max-w-5xl grid content-start">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-2xl">Settle Donations</h3>
        <NavLink
          to="create"
          preventScrollReset
          replace
          className="btn btn-primary text-sm px-3 py-1 flex items-center gap-1"
        >
          <PlusIcon size={16} />
          New
        </NavLink>
      </div>

      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Method</th>
              <th>Donor</th>
              <th>Email</th>
              <th>NPO</th>
              <th>Net</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {settlements.map((s) => (
              <Row key={s.donation_id} settlement={s} />
            ))}
            {settlements.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted-fg py-8">
                  No settlements found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4 mt-4">
        {prev_cursor && (
          <NavLink to="." className="btn-secondary btn text-xs px-3 py-1">
            First page
          </NavLink>
        )}
        {has_more && next_cursor && (
          <NavLink
            to={`?cursor=${next_cursor}`}
            className="btn-secondary btn text-xs px-3 py-1 ml-auto"
          >
            Next
          </NavLink>
        )}
      </div>

      <Outlet />
    </div>
  );
}

type ISettlementRow = Route.ComponentProps["loaderData"]["settlements"][number];
function Row({ settlement: c }: { settlement: ISettlementRow }) {
  return (
    <tr className="text-sm">
      <td className="whitespace-nowrap">
        {format(new Date(c.created_at), "MMM d, yyyy")}
      </td>
      <td className="whitespace-nowrap">{via_name(c.via)}</td>
      <td className="truncate max-w-[10rem]" title={c.donor_name ?? ""}>
        {c.donor_name ?? "—"}
      </td>
      <td className="truncate max-w-[12rem]" title={c.donor_email ?? ""}>
        {c.donor_email ?? "—"}
      </td>
      <td className="truncate max-w-[10rem]" title={c.npo_name ?? ""}>
        {c.npo_name ?? "—"}
      </td>
      <td className="font-medium">
        {c.net != null ? `$${humanize(c.net)}` : "—"}
      </td>
      <td className="truncate max-w-[12rem]" title={c.reference ?? ""}>
        {c.reference ?? "—"}
      </td>
    </tr>
  );
}
