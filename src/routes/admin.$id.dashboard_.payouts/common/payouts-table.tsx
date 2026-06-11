import { format } from "date-fns";
import { ArrowRightIcon } from "lucide-react";
import { LoadMoreRow } from "#/components/load-more-row";
import type { IPaginator } from "#/types/components";
import { humanize } from "@/helpers/decimal";
import type { IPayout } from "@/payouts";
import { payout_status_config, payout_status_label } from "@/payouts/helpers";
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
    <div
      className={`${classes} overflow-x-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border`}
    >
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
            <tr>
              <td colSpan={5} className="text-center text-muted-fg py-8">
                No payouts found
              </td>
            </tr>
          ) : (
            items.map((payout, idx) => {
              const cfg = payout_status_config(payout.type);
              return (
                <tr key={idx}>
                  <td className="w-8">
                    <ArrowRightIcon
                      size={14}
                      className="inline stroke-success"
                    />
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
                    <span
                      className={`inline-flex items-center gap-2 text-xs font-medium ${cfg.text}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      {payout_status_label(payout.type)}
                    </span>
                  </td>
                </tr>
              );
            })
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
