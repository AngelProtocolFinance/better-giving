import { Bars, Spark } from "./spark";

export type TDeltaTone = "positive" | "negative" | "neutral";

interface IProps {
  label: string;
  value: string;
  delta?: React.ReactNode;
  delta_tone?: TDeltaTone;
  data?: number[];
  bars?: boolean;
}

const TONE_COLOR: Record<TDeltaTone, string> = {
  positive: "text-success",
  negative: "text-destructive",
  neutral: "text-muted-fg",
};

export function KpiCard({
  label,
  value,
  delta,
  delta_tone = "neutral",
  data,
  bars,
}: IProps) {
  const delta_color = TONE_COLOR[delta_tone];
  return (
    <div className="rounded border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-muted-fg">{label}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight">{value}</div>
          {delta && (
            <div className={`mt-2 text-xs ${delta_color}`}>{delta}</div>
          )}
        </div>
        {data && data.length > 0 && (
          <div className="shrink-0">
            {bars ? <Bars data={data} /> : <Spark data={data} />}
          </div>
        )}
      </div>
    </div>
  );
}
