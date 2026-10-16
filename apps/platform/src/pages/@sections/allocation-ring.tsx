import type { CSSProperties } from "react";
import { Fragment } from "react";

const allocation = [
  {
    pct: 50,
    label: "U.S. equities",
    swatch: "bg-primary",
    stroke: "stroke-primary",
  },
  {
    pct: 10,
    label: "non-U.S. equities",
    swatch: "bg-primary/65",
    stroke: "stroke-primary/65",
  },
  {
    pct: 32.5,
    label: "fixed income",
    swatch: "bg-primary/30",
    stroke: "stroke-primary/30",
  },
  { pct: 7.5, label: "metals", swatch: "bg-warning", stroke: "stroke-warning" },
] as const;

// each segment is one dashed circle on a 100-unit path, rotated to start at
// twelve o'clock; the gap is cut from the segment's own length, so every
// segment still starts at its true cumulative share.
const SEGMENT_GAP = 0.8;
const segments = allocation.map((a, i) => ({
  ...a,
  start: allocation.slice(0, i).reduce((sum, x) => sum + x.pct, 0),
}));

interface IAllocationRing {
  /** the figure set in the ring's hole */
  center_value: string;
  /** the caption under that figure, one entry per line */
  center_label: readonly string[];
  classes?: string;
}

/** the Sustainability Fund's target allocation: the segmented ring and its
 *  proportional-bar legend. the frame around it (card, caption) is the
 *  caller's. */
export function AllocationRing({
  center_value,
  center_label,
  classes = "",
}: IAllocationRing) {
  // the legend under the ring is the readable breakdown, so the ring's own
  // name carries only what the legend doesn't: the figure in its hole
  const ring_label = `Target allocation, shares listed below. Center: ${center_value} ${center_label.join(" ")}`;
  return (
    <div className={`${classes} grid gap-8`}>
      <div
        className="grid place-items-center justify-self-center size-60 md:size-64"
        role="img"
        aria-label={ring_label}
      >
        <svg
          viewBox="0 0 120 120"
          className="col-start-1 row-start-1 size-full -rotate-90"
          fill="none"
          aria-hidden
        >
          {segments.map((s) => (
            <circle
              key={s.label}
              cx="60"
              cy="60"
              r="50"
              pathLength="100"
              strokeWidth="16"
              className={s.stroke}
              strokeDasharray={`${s.pct - SEGMENT_GAP} ${100 - s.pct + SEGMENT_GAP}`}
              strokeDashoffset={-s.start}
            />
          ))}
        </svg>
        <div className="col-start-1 row-start-1 grid justify-items-center text-center gap-1.5">
          <span className="display-figure text-5xl">{center_value}</span>
          <span className="text-xs text-gray-11">
            {center_label.map((line, i) => (
              <Fragment key={line}>
                {i > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </span>
        </div>
      </div>
      <ul className="grid gap-4 text-sm">
        {allocation.map((a, i) => (
          <li
            key={a.label}
            className="grid gap-1.5 reveal"
            style={{ "--reveal-order": Math.min(i, 3) } as CSSProperties}
          >
            <span className="flex items-baseline justify-between gap-4">
              <span>{a.label}</span>
              <span className="figures font-bold">{a.pct}%</span>
            </span>
            <span
              className="h-2 rounded-full bg-gray-3 overflow-hidden"
              aria-hidden
            >
              <span
                className={`block h-full rounded-full ${a.swatch}`}
                style={{ width: `${a.pct}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
