import { PiggyBank, TrendingUp } from "lucide-react";
import type React from "react";

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

const reveal_order = (n: number) =>
  ({ "--reveal-order": n }) as React.CSSProperties;

interface IGrowFunds {
  classes?: string;
}

export function GrowFunds({ classes = "" }: IGrowFunds) {
  return (
    <section className={classes} aria-labelledby="grow-funds-heading">
      <div className="page grid gap-14 lg:gap-20 lg:grid-cols-2 items-center">
        <div className="grid gap-5 content-start">
          <div className="grid gap-5 reveal">
            <p className="eyebrow text-primary">Grow your funds</p>
            <h2 id="grow-funds-heading" className="section-heading">
              This quarter's gifts,{" "}
              <em className="text-primary">next decade's reserves</em>
            </h2>
            <p className="text-gray-11 text-lg text-pretty">
              Route any share of your donations into two places money grows:
            </p>
          </div>
          <div className="grid gap-4 mt-3">
            <FundOption
              icon={<PiggyBank className="icon-xl" />}
              title="High-yield savings"
              order={1}
            >
              FDIC-insured, ~3-4% yield, accessible anytime. Electronic payouts
              within 5 working days.
            </FundOption>
            <FundOption
              icon={<TrendingUp className="icon-xl" />}
              title="Sustainability Fund"
              order={2}
            >
              Professionally managed, investment-committee governed, rebalanced
              quarterly. ~11% average annual return over the past five years.*
              No setup, AUM, or performance fees.
            </FundOption>
          </div>
          <p className="text-xs text-gray-11">
            *Past performance is not indicative of future results; all
            investments carry risk.
          </p>
        </div>

        <figure className="card shadow-lift-card grid gap-8 reveal">
          <figcaption className="text-lg font-bold text-center">
            Sustainability Fund target allocation
          </figcaption>
          <div
            className="grid place-items-center justify-self-center size-60 md:size-64"
            role="img"
            aria-label="Target allocation: 50% U.S. equities, 10% non-U.S. equities, 32.5% fixed income, 7.5% metals"
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
              <span className="display-figure text-5xl">~11%</span>
              <span className="text-xs text-gray-11">
                avg. annual return,
                <br />
                past 5 yrs*
              </span>
            </div>
          </div>
          <ul className="grid gap-4 text-sm">
            {allocation.map((a, i) => (
              <li
                key={a.label}
                className="grid gap-1.5 reveal"
                style={reveal_order(Math.min(i, 3))}
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
        </figure>
      </div>
    </section>
  );
}

interface IFundOption {
  icon: React.ReactNode;
  title: string;
  order: number;
  children: React.ReactNode;
}

function FundOption({ icon, title, order, children }: IFundOption) {
  return (
    <div
      className="card flex gap-4 items-start reveal"
      style={reveal_order(order)}
    >
      <span
        className="flex-none size-11 rounded-full bg-secondary text-primary grid place-items-center"
        aria-hidden
      >
        {icon}
      </span>
      <div className="grid gap-1">
        <h3 className="font-bold">{title}</h3>
        <p className="text-sm/relaxed text-gray-11">{children}</p>
      </div>
    </div>
  );
}
