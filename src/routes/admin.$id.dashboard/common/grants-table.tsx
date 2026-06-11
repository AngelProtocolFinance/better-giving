import { format } from "date-fns";
import { LoadMoreRow } from "#/components/load-more-row";
import type { IPaginator } from "#/types/components";
import { humanize } from "@/helpers/decimal";
import type { SettlementRow } from "$/pg/queries/payout";

export interface Props extends IPaginator<SettlementRow> {}

export function GrantsTable({
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
            <th>Amount</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={2} className="text-center text-muted-fg py-8">
                No grants found
              </td>
            </tr>
          )}
          {items.map((payout, idx) => (
            <tr key={idx}>
              <td>${humanize(payout.amount)} </td>
              <td>{format(payout.date, "PP")}</td>
            </tr>
          ))}
        </tbody>
        {load_next && (
          <LoadMoreRow
            col_span={2}
            disabled={disabled}
            loading={loading}
            on_load_next={load_next}
          />
        )}
      </table>
    </div>
  );
}
