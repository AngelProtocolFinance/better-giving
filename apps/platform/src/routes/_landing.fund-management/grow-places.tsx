import { Badge } from "@better-giving/ui";
import { PiggyBank, TrendingUp } from "lucide-react";
import type { CSSProperties } from "react";

interface IGrowPlaces {
  classes?: string;
}

export function GrowPlaces({ classes = "" }: IGrowPlaces) {
  return (
    <section className={classes} aria-labelledby="grow-places-heading">
      <div className="page">
        <h2
          id="grow-places-heading"
          className="section-heading text-center max-w-2xl mx-auto reveal"
        >
          Two places <em className="text-primary">your money grows</em>
        </h2>
        {/* md: the two cards share one four-row track set through subgrid, so
            the tags, headings, figures and copy sit on common lines */}
        <div className="grid gap-6 md:grid-cols-2 md:grid-rows-[auto_auto_auto_1fr] mt-14 md:mt-16">
          <article
            className="card shadow-lift-card reveal grid gap-6 content-start md:row-span-4 md:grid-rows-subgrid"
            style={{ "--reveal-order": 0 } as CSSProperties}
          >
            <div className="flex items-center justify-between gap-4">
              <Badge size="md" tone="secondary">
                No market risk
              </Badge>
              <span
                aria-hidden="true"
                className="flex-center size-12 rounded-full bg-secondary text-primary"
              >
                <PiggyBank className="icon-2xl" />
              </span>
            </div>
            <h3 className="subsection-heading">High-yield savings</h3>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="display-figure text-6xl text-primary">
                ~3-4%
              </span>
              <span className="text-base text-gray-11">annual yield</span>
            </p>
            <p className="text-base/relaxed text-gray-11 text-pretty">
              FDIC-insured and accessible anytime. A reliable way to build
              reserves while funds stay safe and liquid, with electronic payouts
              within 5 working days whenever you need them.
            </p>
          </article>

          <article
            className="relative surface-deep rounded p-6 shadow-lift-card reveal grid gap-6 content-start md:row-span-4 md:grid-rows-subgrid"
            style={{ "--reveal-order": 1 } as CSSProperties}
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded dot-grid dot-grid-fade"
            />
            <div className="relative flex items-center justify-between gap-4">
              {/* Badge's on-primary tone is measured on --primary only */}
              <span className="rounded-full border px-3 py-1.5 text-xs font-medium">
                Long-term growth
              </span>
              <span
                aria-hidden="true"
                className="flex-center size-12 rounded-full border text-amber-6"
              >
                <TrendingUp className="icon-2xl" />
              </span>
            </div>
            <h3 className="relative subsection-heading">Sustainability Fund</h3>
            <p className="relative flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="display-figure text-6xl text-amber-6">~11%</span>
              <span className="text-base text-blue-5">
                avg. annual return, past 5 yrs*
              </span>
            </p>
            <p className="relative text-base/relaxed text-blue-5 text-pretty">
              A professionally managed, pooled investment fund designed for
              long-term stability: your path to an endowment-style reserve,
              whatever your size. DAF gifts can route straight into it.
            </p>
          </article>
        </div>
        <p className="mt-6 text-xs text-gray-11 text-center">
          *Past performance is not indicative of future results; all investments
          carry risk.
        </p>
      </div>
    </section>
  );
}
