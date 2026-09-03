import { EmptyRow, LoadMoreRow } from "@better-giving/ui";
import { Arrow, Content, Tooltip } from "@better-giving/ui/tooltip";
import { InfoIcon } from "lucide-react";
import type { IPaginator } from "#/types/components";
import { toPP } from "@/helpers/date";
import { humanize } from "@/helpers/decimal";
import type { IRevenueLog } from "@/revenue";

export interface Props extends IPaginator<IRevenueLog> {}

export function LogsTable({
  items,
  classes = "",
  disabled,
  loading,
  load_next,
}: Props) {
  return (
    <div className={`${classes} table-scroll`}>
      <table className="table w-full">
        <thead>
          <tr>
            <th>Date</th>
            <th>NPO</th>
            <th>Type</th>
            <th className="text-right">Gross</th>
            <th className="text-right">Commission</th>
            <th className="text-right">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {items.map((l) => (
            <tr key={l.id} className="text-sm">
              <td className="whitespace-nowrap">{toPP(l.date)}</td>
              <td className="truncate max-w-40" title={l.npo_name ?? ""}>
                {l.npo_name ?? "—"}
              </td>
              <td>{l.type}</td>
              <td className="text-right">${humanize(l.gross)}</td>
              <td className="text-right">
                <span
                  className={
                    l.status === "refunded" || l.status === "refunded_loss"
                      ? "line-through text-destructive-subtle-fg"
                      : ""
                  }
                >
                  ${humanize(l.commission)}
                </span>
              </td>
              <td className="text-right font-medium">
                <span
                  className={
                    l.status === "refunded" || l.status === "refunded_loss"
                      ? "line-through text-destructive-subtle-fg"
                      : ""
                  }
                >
                  ${humanize(l.revenue)}
                </span>
                {(l.status === "refunded" || l.status === "refunded_loss") && (
                  <Tooltip
                    tip={
                      <Content className="max-w-xs text-xs">
                        <Arrow />
                        Refunded
                      </Content>
                    }
                  >
                    <InfoIcon
                      size={14}
                      className="inline ml-1 text-destructive"
                    />
                  </Tooltip>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <EmptyRow col_span={6}>No revenue logs yet</EmptyRow>
          )}
        </tbody>
        {load_next && (
          <LoadMoreRow
            col_span={6}
            disabled={disabled}
            loading={loading}
            on_load_next={load_next}
          />
        )}
      </table>
    </div>
  );
}
