import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import { href, Link } from "react-router";

interface IPlan {
  name: string;
  figure: string;
  unit: string;
  points: string[];
  cta: { label: string; to: string };
}

const plans: IPlan[] = [
  {
    name: "Fundraising & fund management",
    figure: "$0",
    unit: "all features included",
    points: [
      "Donation form, every gift type, embedding",
      "Recurring giving, peer-to-peer, receipts & reporting",
      "High-yield savings & Sustainability Fund. Returns vary, and past performance isn't a guarantee.",
      "Full donor data, exports, portability guarantee",
    ],
    cta: { label: "Join free forever", to: href("/register") },
  },
  {
    name: "Fiscal sponsorship",
    figure: "2.9%",
    unit: "per sponsored gift",
    points: [
      "Tax-deductible U.S. giving for orgs abroad or without a 501(c)(3)",
      "Compliance, receipts & granting handled",
      "Market rate is 4-10%, and we're working to make ours donor-coverable",
    ],
    cta: { label: "Learn more", to: href("/fiscal-sponsorship") },
  },
];

interface IPriceCards {
  classes?: string;
}

export function PriceCards({ classes = "" }: IPriceCards) {
  return (
    <section className={classes} aria-label="Plans">
      {/* md: one four-row track set shared by both cards through subgrid, so
          the figures, the lists and the buttons sit on common lines */}
      <ul className="page grid gap-6 md:grid-cols-2 md:grid-rows-[auto_auto_1fr_auto]">
        {plans.map((plan, i) => (
          <Plan key={plan.name} plan={plan} featured={i === 0} order={i} />
        ))}
      </ul>
    </section>
  );
}

interface IPlanCard {
  plan: IPlan;
  featured: boolean;
  order: number;
}

function Plan({ plan, featured, order }: IPlanCard) {
  return (
    <li
      className={`${featured ? "tile-deep" : "tile"} reveal grid gap-6 md:row-span-4 md:grid-rows-subgrid`}
      style={{ "--reveal-order": order } as CSSProperties}
    >
      <h2 className="text-lg font-bold">{plan.name}</h2>

      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="display-figure text-6xl md:text-7xl">
          {plan.figure}
        </span>
        <span
          className={`text-base ${featured ? "text-blue-5" : "text-gray-11"}`}
        >
          {plan.unit}
        </span>
      </p>

      <ul
        className={`grid content-start gap-3 text-sm/relaxed ${featured ? "" : "text-gray-12"}`}
      >
        {plan.points.map((point) => (
          <li key={point} className="flex gap-3">
            <span
              className="flex-none mt-0.5 size-5 rounded-full bg-primary text-primary-fg grid place-items-center"
              aria-hidden
            >
              <Check className="icon-xs" strokeWidth={3} />
            </span>
            {point}
          </li>
        ))}
      </ul>

      <Link to={plan.cta.to} className="btn btn-lg btn-secondary self-end">
        {plan.cta.label}
      </Link>
    </li>
  );
}
