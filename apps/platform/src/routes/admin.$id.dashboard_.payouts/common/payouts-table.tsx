import { EmptyRow, PayoutStatus } from "@better-giving/ui";
import { format } from "date-fns";
import { ArrowRightIcon } from "lucide-react";
import { LoadMoreRow } from "#/components/load-more-row";
import type { IPaginator } from "#/types/components";
import { humanize } from "@/helpers/decimal";
import type { IPayout } from "@/payouts";
import { desc } from "./desc";

export interface IPayoutsTable extends IPaginator<IPayout> {}

export function PayoutsTable({
  items,
  classes = "",
  disabled,
  loading,
  load_next,
}: IPayoutsTable) {
  return (
    <div className={`${classes} table-scroll`}>
      <table className="table">
        <thead>
          <tr>
            <th />
            <th>Amount</th>
            <th>From</th>
            <th>Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <EmptyRow col_span={5}>No payouts yet</EmptyRow>
          ) : (
            items.map((payout, idx) => (
              <tr key={idx}>
                <td className="w-8">
                  <ArrowRightIcon size={14} className="inline stroke-success" />
                </td>
                <td>
                  <span
                    className={
                      payout.type === "refunded"
                        ? "line-through text-destructive"
                        : ""
                    }
                  >
                    ${humanize(payout.amount)}
                  </span>
                </td>
                <td>{desc(payout)}</td>
                <td>{format(payout.date, "PP")}</td>
                <td>
                  <PayoutStatus type={payout.type} />
                </td>
              </tr>
            ))
          )}
        </tbody>
        {load_next && (
          <LoadMoreRow
            col_span={5}
            disabled={disabled}
            loading={loading}
            on_load_next={load_next}
          />
        )}
      </table>
    </div>
  );
}
