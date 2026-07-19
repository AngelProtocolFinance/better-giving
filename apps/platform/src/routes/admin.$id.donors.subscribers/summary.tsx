import type { INpoSubSummary, INpoSubTrends } from "$/pg/queries/subscription";
import { KpiCard } from "../admin.$id.donors/kpi-card";

interface IKpiProps {
  summary: INpoSubSummary;
  trends: INpoSubTrends;
}

export function SubscribersKpis({ summary, trends }: IKpiProps) {
  const mrr_now = trends.trend_mrr[trends.trend_mrr.length - 1] ?? 0;

  const count_parts: string[] = [];
  if (summary.new_count > 0) count_parts.push(`${summary.new_count} new`);
  if (summary.cancelled_count > 0)
    count_parts.push(`${summary.cancelled_count} cancelled`);
  const cancelled_note =
    summary.cancelled_billed_usd > 0
      ? `includes $${summary.cancelled_billed_usd.toLocaleString()} from subs cancelled this month`
      : count_parts.length
        ? `${count_parts.join(" · ")} this month`
        : undefined;

  const net = summary.net_new_usd;
  const net_sign = net > 0 ? "+" : net < 0 ? "−" : "";
  const has_new = summary.new_usd > 0;
  const has_cancelled = summary.cancelled_usd > 0;
  const net_delta =
    has_new || has_cancelled ? (
      <>
        {has_new && (
          <span className="text-success">
            ${summary.new_usd.toLocaleString()} new
          </span>
        )}
        {has_new && has_cancelled && <span className="text-muted-fg"> · </span>}
        {has_cancelled && (
          <span className="text-destructive">
            ${summary.cancelled_usd.toLocaleString()} cancelled
          </span>
        )}
      </>
    ) : undefined;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <KpiCard
        label="MRR"
        value={`$${mrr_now.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
        delta={cancelled_note}
        data={trends.trend_mrr}
      />
      <KpiCard
        label="Net new MRR"
        value={`${net_sign}$${Math.abs(net).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
        delta={net_delta}
      />
    </div>
  );
}
