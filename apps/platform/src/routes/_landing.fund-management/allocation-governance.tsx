import { ArrowLeftRight, Scale } from "lucide-react";
import type { CSSProperties } from "react";
import { AllocationRing } from "#/pages/@sections/allocation-ring";

const pillars = [
  {
    icon: <Scale className="icon-xl" />,
    title: "Investment-committee governed",
    body: "Professional oversight of strategy and risk, rebalanced quarterly to the target allocation.",
  },
  {
    icon: <span className="display-figure text-lg">$0</span>,
    title: "No fees of any kind",
    body: "No setup, AUM, or performance fees. Unheard of in fund management. The commons covers it.",
  },
  {
    icon: <ArrowLeftRight className="icon-xl" />,
    title: "Your money stays yours",
    body: "Adjust your grant/save/invest split anytime, and withdraw with 5-working-day electronic payouts.",
  },
];

interface IAllocationGovernance {
  classes?: string;
}

// the copy leads in the dom so a narrow screen reads heading → points → ring;
// from lg the ring takes the left column
export function AllocationGovernance({ classes = "" }: IAllocationGovernance) {
  return (
    <section className={classes} aria-labelledby="governance-heading">
      <div className="page grid gap-14 lg:gap-20 lg:grid-cols-2 items-center">
        <div className="grid content-start lg:col-start-2">
          <div className="grid gap-5 reveal">
            <p className="eyebrow text-primary">Governance</p>
            <h2 id="governance-heading" className="section-heading">
              {"Managed like an endowment, "}
              <em className="text-primary">open like a commons</em>
            </h2>
          </div>
          <ul className="mt-10 grid divide-y border-y">
            {pillars.map((p, i) => (
              <li
                key={p.title}
                className="reveal flex gap-5 items-start py-6"
                style={{ "--reveal-order": i + 1 } as CSSProperties}
              >
                <span
                  className="flex-none flex-center size-11 rounded-full bg-surface border text-primary"
                  aria-hidden
                >
                  {p.icon}
                </span>
                <div className="grid gap-1.5">
                  <h3 className="text-lg font-bold">{p.title}</h3>
                  <p className="text-base/relaxed text-gray-11 text-pretty">
                    {p.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <figure className="card-on-band shadow-lift-card grid gap-8 reveal lg:col-start-1 lg:row-start-1">
          <figcaption className="text-lg font-bold text-center">
            Target allocation
          </figcaption>
          <AllocationRing
            center_value="100%"
            center_label={["of growth", "is yours"]}
          />
        </figure>
      </div>
    </section>
  );
}
