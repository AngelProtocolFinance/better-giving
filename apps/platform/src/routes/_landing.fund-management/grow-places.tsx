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
          className="section-heading max-w-2xl reveal"
        >
          Two places your money grows
        </h2>
        {/* md: the two cards share one three-row track set through subgrid,
            so the labels, headings and copy sit on common lines */}
        <div className="grid gap-6 md:grid-cols-2 md:grid-rows-[auto_auto_1fr] mt-14 md:mt-16">
          <article
            className="tile reveal grid gap-6 content-start md:row-span-3 md:grid-rows-subgrid"
            style={{ "--reveal-order": 0 } as CSSProperties}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-gray-11">No market risk</p>
              <PiggyBank aria-hidden="true" className="icon-2xl text-primary" />
            </div>
            <h3 className="subsection-heading">High-yield savings</h3>
            <p className="text-base/relaxed text-gray-11 text-pretty">
              FDIC-insured. A reliable way to build reserves while funds stay
              safe and liquid. Withdrawal requests are reviewed and processed on
              a monthly basis.
            </p>
          </article>

          <article
            className="tile-deep reveal grid gap-6 content-start md:row-span-3 md:grid-rows-subgrid"
            style={{ "--reveal-order": 1 } as CSSProperties}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-blue-5">Long-term growth</p>
              <TrendingUp
                aria-hidden="true"
                className="icon-2xl text-amber-6"
              />
            </div>
            <h3 className="subsection-heading">Sustainability Fund</h3>
            <p className="text-base/relaxed text-blue-5 text-pretty">
              A professionally managed, pooled investment fund designed for
              long-term stability: your path to an endowment-style reserve,
              whatever your size. DAF gifts can route straight into it.
            </p>
          </article>
        </div>
        <p className="mt-6 text-xs text-gray-11">
          Returns vary, and past performance isn't a guarantee.
        </p>
      </div>
    </section>
  );
}
