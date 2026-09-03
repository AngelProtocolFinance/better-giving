import { EmptyRow, LoadMoreRow } from "@better-giving/ui";
import { Arrow, Content, Tooltip } from "@better-giving/ui/tooltip";
import { format } from "date-fns";
import { ArrowRight, InfoIcon } from "lucide-react";
import type { ReactNode } from "react";
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
    <div className={`${classes} table-scroll`}>
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
            <EmptyRow col_span={5}>No transactions yet</EmptyRow>
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
                        <Content className="max-w-xs text-xs">
                          <Arrow />
                          Transaction request was cancelled and will not be
                          processed.
                        </Content>
                      }
                    >
                      <InfoIcon
                        size={14}
                        className="text-gray-11 absolute -left-5 top-0.5"
                      />
                    </Tooltip>
                  )}
                  ${humanize(r.amount)}{" "}
                </div>
              </td>
              <td>{format(r.date_updated, "PP")}</td>
              <td className="uppercase text-xs">
                {r.status === "cancelled" ? (
                  <span className="text-destructive-subtle-fg">Cancelled</span>
                ) : r.status === "pending" ? (
                  <span className="text-warning-subtle-fg">Pending</span>
                ) : (
                  <span className="text-success-subtle-fg">Final</span>
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
