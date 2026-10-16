import {
  ArrowRight,
  Building2,
  ChartSpline,
  Code,
  Coins,
  CreditCard,
  HandCoins,
  Landmark,
  Smartphone,
  Wallet,
  Zap,
} from "lucide-react";
import type React from "react";
import { href, Link } from "react-router";
import map from "#/assets/images/map.webp";

type PillarArt = "form" | "fee" | "gifts" | "growth" | "code" | "map";

interface IPillar {
  title: string;
  body: string;
  cta: string;
  to: string;
  art: PillarArt;
  /** the tile's share of the bento grid, and its layout inside that share */
  span: string;
  /** reveal step: the tile's row in the lg grid */
  order: number;
}

// source order is the bento's auto-flow. lg: raise (2) + keep / gifts, grow,
// open source / the map tile across all three. md: raise (2) / keep, gifts /
// grow, open source / map (2).
const pillars: IPillar[] = [
  {
    title: "Raise more today",
    body: "A high-converting, brandable form that lives on your site. Fewer clicks, express checkout, recurring giving built in.",
    cta: "Explore the product",
    to: href("/product"),
    art: "form",
    span: "md:col-span-2 md:grid-cols-2 md:items-center md:gap-10",
    order: 0,
  },
  {
    title: "Keep more of every dollar",
    body: "No platform or fund-management fees. We're sustained by optional donor contributions at checkout. Always opt-in, never pre-selected.",
    cta: "See pricing",
    to: href("/pricing"),
    art: "fee",
    span: "",
    order: 0,
  },
  {
    title: "Accept every kind of gift",
    body: "Card, bank, PayPal, wallets, stock, DAF, IRA, and crypto. One flow, one integration, no extra portals.",
    cta: "See every gift type",
    to: href("/product"),
    art: "gifts",
    span: "",
    order: 1,
  },
  {
    title: "Grow what you raise",
    body: "High-yield savings and a managed Sustainability Fund turn gifts into lasting reserves, at no cost.",
    cta: "Grow your funds",
    to: href("/fund-management"),
    art: "growth",
    span: "",
    order: 1,
  },
  {
    title: "Open source & member-powered",
    body: "The entire stack is public code. Verify how we work, self-host if you want, and help keep the commons free for every nonprofit.",
    cta: "Read the code",
    to: href("/open-source"),
    art: "code",
    span: "",
    order: 1,
  },
  {
    title: "Go global with fiscal sponsorship",
    body: "Organizations abroad or without a 501(c)(3) can accept tax-deductible U.S. gifts through us: just 2.9%, vs 4-10% market.",
    cta: "Unlock U.S. donors",
    to: href("/fiscal-sponsorship"),
    art: "map",
    span: "md:col-span-2 lg:col-span-3 md:min-h-56 md:content-center",
    order: 2,
  },
];

const gift_icons = [
  CreditCard,
  Landmark,
  Wallet,
  Smartphone,
  ChartSpline,
  HandCoins,
  Building2,
  Coins,
];

interface IPillars {
  classes?: string;
}

export function Pillars({ classes = "" }: IPillars) {
  return (
    <section className={classes} aria-labelledby="pillars-heading">
      <div className="page">
        <h2 id="pillars-heading" className="section-heading max-w-3xl reveal">
          Everything a nonprofit needs to raise, keep, and grow
        </h2>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 mt-12 md:mt-16">
          {pillars.map((p) => (
            <Tile key={p.title} pillar={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

interface ITile {
  pillar: IPillar;
}

function Tile({ pillar: p }: ITile) {
  const on_brand = p.art === "code";
  return (
    <div
      className={`${on_brand ? "surface-primary rounded p-6 md:p-8" : "tile"} group reveal relative isolate overflow-hidden grid gap-8 content-between ${p.span}`}
      style={{ "--reveal-order": p.order } as React.CSSProperties}
    >
      {p.art === "map" ? <MapArt /> : null}
      {p.art === "form" || p.art === "map" ? null : <Art kind={p.art} />}
      <div
        className={`grid gap-2.5 content-start ${p.art === "map" ? "md:max-w-sm" : ""}`}
      >
        {/* the linked tile's hover: the title takes the link ink. not on the
            brand fill, where that ink is the ground */}
        <h3
          className={`text-xl font-bold ${on_brand ? "" : "transition-colors duration-base group-hover:text-primary"}`}
        >
          {p.title}
        </h3>
        <p
          className={`text-sm/relaxed ${on_brand ? "text-primary-fg/90" : "text-gray-11"}`}
        >
          {p.body}
        </p>
        {/* on the brand fill the link keeps the fill's contrast ink and its
            underline hover — the link sweep's one exemption in this file.
            nothing between it and the tile is positioned, so its after: box
            stretches over the tile itself */}
        <Link
          to={p.to}
          className={`justify-self-start inline-flex items-center gap-1.5 font-bold text-sm pt-2 after:absolute after:inset-0 ${on_brand ? "hover:underline" : "link"}`}
        >
          {p.cta}
          <ArrowRight className="icon-md transition-transform duration-base group-hover:translate-x-0.5" />
        </Link>
      </div>
      {p.art === "form" ? <FormArt /> : null}
    </div>
  );
}

interface IArt {
  kind: Exclude<PillarArt, "form" | "map">;
}

function Art({ kind }: IArt) {
  if (kind === "fee") {
    return (
      <span
        className="display-figure text-6xl md:text-7xl text-primary"
        aria-hidden
      >
        $0
      </span>
    );
  }
  if (kind === "code") {
    return <Code className="pictogram-sm" aria-hidden />;
  }
  if (kind === "gifts") {
    return (
      <div className="flex -space-x-2" aria-hidden>
        {gift_icons.map((Icon, i) => (
          <span
            key={i}
            className="size-10 rounded-full border-2 border-secondary bg-surface text-primary grid place-items-center"
          >
            <Icon className="icon-lg" />
          </span>
        ))}
      </div>
    );
  }
  return (
    <svg
      viewBox="0 0 320 64"
      className="w-full h-auto text-primary"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 58 C 60 56, 92 48, 128 42 S 196 30, 228 20 S 292 8, 312 6"
        className="stroke-primary/30"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M4 58 C 60 56, 92 48, 128 42 S 196 30, 228 20 S 292 8, 312 6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="312" cy="6" r="5" fill="currentColor" />
    </svg>
  );
}

/** the dotted world map as a primary-tinted mask: the asset is black at
 *  ≤20% alpha, so the mask caps the fill at that strength and the dots read
 *  as a wash beside the copy rather than as ink. */
function MapArt() {
  return (
    <div
      className="absolute inset-0 -z-10 md:left-1/3 bg-primary max-md:opacity-50"
      style={{
        maskImage: `url(${map})`,
        maskSize: "contain",
        maskPosition: "right center",
        maskRepeat: "no-repeat",
      }}
      aria-hidden
    />
  );
}

/** a mini donation form row: the frequency toggle, the amount grid and the
 *  express-pay pill. decorative — the tile's copy carries the claim. */
function FormArt() {
  return (
    <div className="rounded bg-surface p-6 grid gap-3" aria-hidden>
      <div className="grid grid-cols-2 rounded-full bg-gray-3 p-1 text-xs font-semibold text-center">
        <span className="rounded-full py-1.5 text-gray-11">One-time</span>
        <span className="rounded-full py-1.5 bg-surface text-gray-12 shadow-track-fill">
          Monthly
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-sm font-semibold text-center">
        {["$25", "$50", "$100", "$250"].map((amt) => (
          <span
            key={amt}
            className={`rounded border py-2 ${amt === "$100" ? "border-primary bg-secondary text-primary" : "bg-surface"}`}
          >
            {amt}
          </span>
        ))}
      </div>
      <span className="flex items-center justify-center gap-1.5 rounded-full bg-gray-12 text-gray-1 py-2 text-xs font-semibold">
        <Zap className="icon-sm" />
        Express checkout
      </span>
      <span className="rounded bg-primary text-primary-fg py-2.5 text-sm font-bold text-center">
        Donate $100 monthly
      </span>
    </div>
  );
}
