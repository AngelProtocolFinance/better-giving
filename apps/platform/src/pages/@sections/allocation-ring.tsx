import type { CSSProperties } from "react";

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
  classes?: string;
}

/** the Sustainability Fund's target allocation: the segmented ring and its
 *  proportional-bar legend. the frame around it (card, caption) is the
 *  caller's. the hole stays empty: no return or growth figure is claimed. */
export function AllocationRing({ classes = "" }: IAllocationRing) {
  return (
    <div className={`${classes} grid gap-8`}>
      <div
        className="justify-self-center size-60 md:size-64"
        role="img"
        aria-label="Target allocation, shares listed below"
      >
        <svg
          viewBox="0 0 120 120"
          className="size-full -rotate-90"
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
            {/* gray-7: the first step that holds Lc 15 on all three marketing
                grounds (page 23.8, band 21.5, tile 17.6). the fill on it owes
                only the same Lc 15, the share being printed above it:
                primary/30 15.5, metals' amber 13.9 on luminance alone, which
                its hue separates */}
            <span
              className="h-2 rounded-full bg-gray-7 overflow-clip"
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
