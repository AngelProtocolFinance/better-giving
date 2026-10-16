import {
  CalendarSync,
  Check,
  Gift,
  HandCoins,
  Layers,
  type LucideIcon,
  Palette,
  Users,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

interface IShowcase {
  title: string;
  body: string;
  art: ReactNode;
  /** the tile's share of the bento and its inner layout there */
  span: string;
}

interface ICompact {
  title: string;
  body: string;
  Icon: LucideIcon;
}

// lg: goal tracking (2) + global / receipts + the compact panel (2).
// md: goal tracking (2) / global, receipts / the compact panel (2).
const showcase: IShowcase[] = [
  {
    title: "Goal-tracking progress bars",
    body: "Show real-time progress to motivate donors.",
    art: <GoalArt />,
    span: "md:col-span-2 md:grid-cols-[1fr_1.2fr] md:items-center md:gap-10",
  },
  {
    title: "Global donor access",
    body: "Localized, multi-currency giving worldwide.",
    art: <CurrencyArt />,
    span: "",
  },
  {
    title: "Automated receipts & reporting",
    body: "Branded tax receipts and reporting, handled for you.",
    art: <ReceiptArt />,
    span: "",
  },
];

const compact: ICompact[] = [
  {
    title: "Recurring donations",
    body: "Stabilize revenue with automated monthly giving.",
    Icon: CalendarSync,
  },
  {
    title: "Customizable & embeddable",
    body: "Your brand colors, your wording, on your website.",
    Icon: Palette,
  },
  {
    title: "Peer-to-peer fundraising",
    body: "Every supporter can crowdfund on your behalf.",
    Icon: Users,
  },
  {
    title: "Dedication gifts",
    body: "Donors dedicate gifts to someone special.",
    Icon: Gift,
  },
  {
    title: "Donors cover processing fees",
    body: "Most donors opt to cover fees, so more of every gift reaches you.",
    Icon: HandCoins,
  },
  {
    title: "Program-specific giving",
    body: "Let donors fund the programs they care about.",
    Icon: Layers,
  },
];

interface IFeatures {
  classes?: string;
}

export function Features({ classes = "" }: IFeatures) {
  return (
    <section className={classes} aria-labelledby="features-heading">
      <div className="page">
        <h2
          id="features-heading"
          className="section-heading text-center max-w-2xl mx-auto reveal"
        >
          Smarter tools for{" "}
          <em className="text-primary">simpler fundraising</em>
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-12 md:mt-16">
          {showcase.map((f, i) => (
            <div
              key={f.title}
              className={`card-on-band grid content-between gap-8 reveal ${f.span}`}
              style={{ "--reveal-order": i < 2 ? 0 : 1 } as CSSProperties}
            >
              <div className="grid gap-2 content-start">
                <h3 className="text-xl font-bold text-gray-12">{f.title}</h3>
                <p className="text-sm/relaxed text-gray-11">{f.body}</p>
              </div>
              {f.art}
            </div>
          ))}
          <ul
            className="card-on-band md:col-span-2 grid gap-x-8 gap-y-7 md:grid-cols-2 content-center reveal"
            style={{ "--reveal-order": 1 } as CSSProperties}
          >
            {compact.map(({ title, body, Icon }) => (
              <li key={title} className="grid grid-cols-[auto_1fr] gap-x-4">
                <span
                  aria-hidden="true"
                  className="size-10 rounded-full bg-secondary text-primary grid place-items-center"
                >
                  <Icon className="icon-lg" />
                </span>
                <div className="grid gap-1 content-start">
                  <h3 className="font-bold text-gray-12">{title}</h3>
                  <p className="text-sm/normal text-gray-11">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* the three illustrations below are decorative: each tile's own copy carries
   its claim, and every figure in them is a sample, not a statistic. */

function GoalArt() {
  return (
    <div className="card shadow-lift-card grid gap-4" aria-hidden="true">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-gray-12">
          Spring appeal
        </span>
        <span className="text-xs font-semibold text-primary">75%</span>
      </div>
      <div className="h-3 rounded-full bg-gray-3 inset-shadow-track overflow-hidden">
        <div className="h-full w-3/4 rounded-full bg-primary shadow-track-fill" />
      </div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-bold text-gray-12">$7,500 raised</span>
        <span className="text-gray-11">of $10,000</span>
      </div>
    </div>
  );
}

const currencies = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;

function CurrencyArt() {
  return (
    <div className="grid gap-3" aria-hidden="true">
      <div className="flex flex-wrap gap-2">
        {currencies.map((c) => (
          <span
            key={c}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${c === "EUR" ? "border-primary bg-secondary text-primary" : "bg-surface text-gray-11"}`}
          >
            {c}
          </span>
        ))}
      </div>
      <span className="flex items-center justify-between rounded border border-gray-7 bg-surface px-3 py-2.5 text-sm">
        <span className="font-semibold text-gray-12">€50.00</span>
        <span className="text-xs text-gray-11">EUR</span>
      </span>
    </div>
  );
}

function ReceiptArt() {
  return (
    <div
      className="card shadow-lift-card grid gap-3 text-sm"
      aria-hidden="true"
    >
      <div className="flex items-center gap-2.5">
        <span className="size-6 rounded bg-primary" />
        <span className="font-semibold text-gray-12">Your nonprofit</span>
        <span className="ml-auto text-xs font-semibold text-gray-11">
          Tax receipt
        </span>
      </div>
      <div className="grid gap-1.5 border-t border-dashed pt-3">
        <span className="flex justify-between">
          <span className="text-gray-11">Monthly gift</span>
          <span className="font-semibold text-gray-12">$50.00</span>
        </span>
      </div>
      <span className="flex items-center gap-1.5 text-xs font-semibold text-success-subtle-fg">
        <Check className="icon-sm" strokeWidth={3} />
        Sent to donor
      </span>
    </div>
  );
}
