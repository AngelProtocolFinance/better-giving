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
            <h2 id="grow-funds-heading" className="section-heading">
              This quarter's gifts, next decade's reserves
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
              FDIC-insured. Withdrawal requests are reviewed and processed on a
              monthly basis.
            </FundOption>
            <FundOption
              icon={<TrendingUp className="icon-xl" />}
              title="Sustainability Fund"
              order={2}
            >
              Professionally managed, investment-committee governed, rebalanced
              quarterly.
            </FundOption>
          </div>
          <p className="text-xs text-gray-11">
            Returns vary, and past performance isn't a guarantee.
          </p>
        </div>

        <figure className="grid gap-8 reveal">
          <figcaption className="text-lg font-bold text-center">
            Sustainability Fund target allocation
          </figcaption>
          <AllocationRing />
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
      className="tile flex gap-5 items-start reveal"
      style={reveal_order(order)}
    >
      <span className="flex-none text-primary" aria-hidden>
        {icon}
      </span>
      <div className="grid gap-1">
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="text-base/relaxed text-gray-11">{children}</p>
      </div>
    </div>
  );
}
