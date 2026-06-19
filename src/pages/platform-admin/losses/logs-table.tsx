import { LoadMoreRow } from "#/components/load-more-row";
import type { IPaginator } from "#/types/components";
import { toPP } from "@/helpers/date";
import { humanize } from "@/helpers/decimal";
import type { ILossLog } from "@/revenue";

export interface Props extends IPaginator<ILossLog> {}

export function LogsTable({
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
            <th>NPO</th>
            <th>Type</th>
            <th className="text-right">Total</th>
            <th className="text-right">NPO</th>
            <th className="text-right">BG Fees</th>
            <th className="text-right">Processing</th>
            <th>Reason</th>
            <th>Donation</th>
          </tr>
        </thead>
        <tbody>
          {items.map((l) => (
            <tr key={l.id} className="text-sm">
              <td className="whitespace-nowrap">{toPP(l.date)}</td>
              <td>{l.npo_id}</td>
              <td>{l.type}</td>
              <td className="text-right font-medium">${humanize(l.amount)}</td>
              <td className="text-right">${humanize(l.npo_amount)}</td>
              <td className="text-right">${humanize(l.fees_bg)}</td>
              <td className="text-right">${humanize(l.fees_processing)}</td>
              <td className="max-w-56 truncate" title={l.reason}>
                {l.reason}
              </td>
              <td className="font-mono text-xs">{l.donation_id}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center text-muted-fg py-8">
                No loss logs yet
              </td>
            </tr>
          )}
        </tbody>
        {load_next && (
          <LoadMoreRow
            col_span={9}
            disabled={disabled}
            loading={loading}
            on_load_next={load_next}
          />
        )}
      </table>
    </div>
  );
}
