import { format } from "date-fns";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import { Modal } from "#/components/modal";
import type { INpoMetrics } from "#/types/npo-sf-metrics";
import { humanize } from "@/helpers/decimal";

const date_fmt = (input: string): string => {
  return format(new Date(input), "MM/dd");
};

const CustomTooltip = ({
  active,
  payload,
  label,
}: TooltipProps<number, string>) => {
  if (active && payload?.length && label) {
    return (
      <div className="bg-popover text-popover-fg rounded p-2 shadow-lg text-xs grid gap-y-1">
        <p className="font-medium">{date_fmt(label)}</p>
        {payload.map((entry, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            ${humanize(entry.value || 0)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function SfPerChart(
  props: INpoMetrics & { open: boolean; onClose: () => void }
) {
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      classes="h-96 p-4 fixed-center z-20 border bg-background w-[91%] sm:w-full max-w-156 rounded overflow-hidden"
    >
      <div className="flex flex-wrap gap-y-2 justify-between">
        <h4>Investment performance</h4>
        <div className="flex gap-x-2 items-center">
          <button
            type="button"
            className=" btn-primary text-xs px-2 py-1 rounded pointer-events-none"
          >
            3 months
          </button>
          <button
            disabled
            type="button"
            className=" btn-secondary text-xs px-2 py-1 rounded"
          >
            1 year
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={props.points}
          margin={{
            top: 40,
            right: 30,
            left: 30,
            bottom: 40,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            className="text-xs"
            dataKey="date"
            tickFormatter={date_fmt}
            angle={-45}
            textAnchor="end"
            height={35}
            dy={10}
            type="category"
            interval={0}
          />
          <YAxis
            yAxisId="left"
            className="text-xs"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => `$${humanize(v)}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="top"
            height={36}
            iconType="line"
            wrapperStyle={{ fontSize: "0.75rem" }}
            payload={[
              {
                value: "Invested Capital",
                type: "rect",
                color: "var(--chart-1)",
              },
              {
                value: "Market Value",
                type: "line",
                color: "var(--chart-2)",
              },
            ]}
          />
          <Bar
            yAxisId="left"
            dataKey="invested"
            fill="var(--chart-1)"
            opacity={0.6}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="perf"
            stroke="var(--chart-2)"
            // dot={false}
            strokeWidth={2}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Modal>
  );
}
