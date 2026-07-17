import { format } from "date-fns";
import { NavLink } from "react-router";
import { LoadMoreRow } from "#/components/load-more-row";
import { NpoName } from "#/components/npo-name";
import type { IPaginator } from "#/types/components";
import type { IBalanceTx } from "@/balance-txs";
import { humanize } from "@/helpers/decimal";

export interface Props extends IPaginator<IBalanceTx> {}

export function Table({
  items,
  classes = "",
  disabled,
  loading,
  load_next,
}: Props) {
  return (
    <div
      className={`${classes} overflow-x-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border`}
    >
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Requestor</th>
            <th>Units</th>
            <th>Price</th>
            <th>Value</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((r, idx) => (
            <tr key={idx} className="text-sm">
              <td>{format(r.date_created, "PP")}</td>
              <td>Redeem units</td>
              <td>
                <NpoName id={r.npo_id} />
              </td>
              <td>{humanize(r.amount_units)}</td>
              <td>${humanize(r.amount / r.amount_units)}</td>
              <td>${humanize(r.amount)}</td>
              <td>
                {r.status === "pending" ? (
                  <div className="flex items-center gap-x-2">
                    <NavLink
                      to={`${r.id}/approve`}
                      className="btn-success text-xs font-bold px-2 py-1 rounded"
                    >
                      Approve
                    </NavLink>
                    <NavLink
                      to={`${r.id}/reject`}
                      className="btn-destructive text-xs font-bold px-2 py-1 rounded"
                    >
                      Reject
                    </NavLink>
                  </div>
                ) : r.status === "cancelled" ? (
                  <span className="text-destructive">Cancelled</span>
                ) : (
                  <span className="text-success">Final</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        {load_next && (
          <LoadMoreRow
            col_span={7}
            disabled={disabled}
            loading={loading}
            on_load_next={load_next}
          />
        )}
      </table>
    </div>
  );
}
