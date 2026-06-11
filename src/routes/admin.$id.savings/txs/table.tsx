import { format } from "date-fns";
import { ArrowRight, InfoIcon } from "lucide-react";
import type { ReactNode } from "react";
import { LoadMoreRow } from "#/components/load-more-row";
import { Arrow, Content, Tooltip } from "#/components/tooltip";
import type { IPaginator } from "#/types/components";
import type { IBalanceTx } from "@/balance-txs";
import { humanize } from "@/helpers/decimal";
import { row_meta } from "./row-meta";

export interface Props extends IPaginator<IBalanceTx> {}

export function FlowIcon(this_account: string, data: IBalanceTx): ReactNode {
  if (data.account === this_account) {
    return <ArrowRight size={16} className="text-success" />;
  }
}

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
            {/* icons */}
            <th />
            <th />
            <th>Amount</th>
            <th>Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center text-muted-fg py-8">
                No transactions found
              </td>
            </tr>
          )}
          {items.map((r, idx) => (
            <tr key={idx}>
              <td>{row_meta(r).icon}</td>
              <td>{row_meta(r).description}</td>

              <td>
                <div className="relative">
                  {r.status === "cancelled" && (
                    <Tooltip
                      tip={
                        <Content className="max-w-xs bg-popover outline outline-border p-4 text-popover-fg text-xs shadow-lg rounded">
                          <Arrow />
                          Transaction request was cancelled and will not be
                          processed.
                        </Content>
                      }
                    >
                      <InfoIcon
                        size={14}
                        className="text-muted-fg absolute -left-5 top-0.5"
                      />
                    </Tooltip>
                  )}
                  ${humanize(r.amount)}{" "}
                </div>
              </td>
              <td>{format(r.date_updated, "PP")}</td>
              <td className="uppercase text-xs">
                {r.status === "cancelled" ? (
                  <span className="text-destructive">Cancelled</span>
                ) : r.status === "pending" ? (
                  <span className="text-warning">Pending</span>
                ) : (
                  <span className="text-success">Final</span>
                )}
              </td>
            </tr>
          ))}
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
