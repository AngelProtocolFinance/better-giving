import { ExtLink } from "@better-giving/ui";
import { ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";
import { href, Link } from "react-router";
import { BOOK_A_DEMO } from "#/constants/urls";

interface IHero {
  classes?: string;
}

export function Hero({ classes = "" }: IHero) {
  return (
    <div className={`${classes} pt-12 pb-24 md:pt-20 md:pb-32`}>
      <div className="page grid gap-16 lg:gap-12 lg:grid-cols-[3fr_2fr] items-center">
        <div className="grid gap-6 justify-items-start">
          <h1 className="hero-heading">Unlock U.S. donors, wherever you are</h1>
          <p className="text-lg/relaxed md:text-xl/relaxed text-pretty text-gray-11 max-w-xl">
            As a U.S. 501(c)(3), Better Giving accepts tax-deductible gifts and
            grants on your behalf, so organizations abroad, or without their own
            501(c)(3), can reach U.S. donors and foundations without
            incorporating.
          </p>
          <div className="flex max-sm:flex-col max-sm:justify-self-stretch sm:flex-wrap sm:items-center gap-3.5 mt-2">
            <Link
              to={href("/register")}
              className="group btn btn-lg btn-primary gap-2"
            >
              Apply in minutes
              <ArrowRight
                aria-hidden="true"
                className="icon-md transition-transform motion-safe:group-hover:translate-x-0.5"
              />
            </Link>
            <ExtLink href={BOOK_A_DEMO} className="btn btn-lg btn-secondary">
              Book a demo
            </ExtLink>
          </div>
        </div>

        <FeeComparison />
      </div>
    </div>
  );
}

/** both bars share one 0-10% axis, so a bar's width is its rate × 10 */
const AXIS = ["0%", "5%", "10%"] as const;

// the market range as a hatch: the neutral that reads as "theirs" beside our
// solid brand fill. drawn from tokens so it follows the palette
const market_hatch = {
  backgroundImage: `repeating-linear-gradient(
    -45deg,
    var(--color-gray-8) 0 calc(var(--spacing) * 1),
    var(--color-gray-4) 0 calc(var(--spacing) * 2)
  )`,
} satisfies CSSProperties;

/** decorative: its aria-label is the whole of what it says */
function FeeComparison() {
  return (
    <div
      role="img"
      aria-label="Fee comparison: Better Giving's fiscal sponsorship fee is 2.9% per sponsored gift; typical fiscal sponsors charge 4-10%."
      className="tile w-full max-w-lg justify-self-center lg:justify-self-end"
    >
      <div aria-hidden className="grid gap-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-bold text-gray-12">Sponsorship fee</span>
          <span className="text-sm text-gray-11">per sponsored gift</span>
        </div>

        <div className="grid gap-3">
          <div className="flex items-end justify-between gap-4">
            <span className="font-bold text-gray-12">Better Giving</span>
            <span className="display-figure text-5xl md:text-6xl text-nowrap text-primary">
              2.9%
            </span>
          </div>
          <span className="block h-5 rounded-full bg-surface">
            <span className="block h-full w-[29%] rounded-full bg-primary" />
          </span>
        </div>

        <div className="grid gap-3">
          <div className="flex items-end justify-between gap-4">
            <span className="text-gray-11">Typical market range</span>
            <span className="display-figure text-5xl md:text-6xl text-nowrap text-gray-11">
              4-10%
            </span>
          </div>
          <span className="relative block h-5 rounded-full bg-surface">
            <span
              className="absolute inset-y-0 inset-s-2/5 inset-e-0 rounded-full"
              style={market_hatch}
            />
          </span>
          {/* three equal columns put the middle tick's centre at exactly 50% */}
          <span className="grid grid-cols-3 text-xs text-gray-11">
            {AXIS.map((tick) => (
              <span
                key={tick}
                className="first:justify-self-start justify-self-center last:justify-self-end"
              >
                {tick}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
