import { PiggyBank, TrendingUp } from "lucide-react";
import type React from "react";
import { AllocationRing } from "#/pages/@sections/allocation-ring";

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
          <AllocationRing
            center_value="~11%"
            center_label={
              <>
                avg. annual return,
                <br />
                past 5 yrs*
              </>
            }
          />
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
