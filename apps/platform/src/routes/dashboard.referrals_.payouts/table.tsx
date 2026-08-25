import { EmptyRow } from "@better-giving/ui";
import { Arrow, Content, Tooltip } from "@better-giving/ui/tooltip";
import { format } from "date-fns";
import { Info } from "lucide-react";
import { LoadMoreRow } from "#/components/load-more-row";
import type { IPaginator } from "#/types/components";
import { humanize } from "@/helpers/decimal";
import type { IPayout } from "@/referrals/interface";

export interface Props extends IPaginator<IPayout> {}
export function Table({
  items,
  classes = "",
  disabled,
  loading,
  load_next,
}: Props) {
  return (
    <div className={`${classes} table-scroll`}>
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <EmptyRow col_span={2}>No payouts yet</EmptyRow>
          ) : (
            items.map((payout, idx) => (
              <tr
                key={idx}
                className={
                  payout.error ? "text-destructive-subtle-fg" : "text-gray-12"
                }
              >
                <td>{format(payout.date, "PP")}</td>
                <td>
                  <div className="relative">
                    {payout.error && (
                      <Tooltip
                        tip={
                          <Content className="max-w-xs bg-panel outline outline-gray-6 p-4 text-gray-12 text-xs shadow-floating rounded">
                            <Arrow />
                            Commission amount not paid out and will be retried
                            in the next cycle.
                          </Content>
                        }
                      >
                        <Info size={16} className="absolute -left-5 top-0.5" />
                      </Tooltip>
                    )}
                    ${humanize(payout.amount)}{" "}
                  </div>
                </td>
              </tr>
            ))
          )}
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
