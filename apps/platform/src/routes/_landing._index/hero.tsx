import { Badge, ExtLink, Image } from "@better-giving/ui";
import {
  ArrowRight,
  Building2,
  CalendarSync,
  ChartSpline,
  Coins,
  CreditCard,
  HandCoins,
  Landmark,
  PiggyBank,
  Smartphone,
  Wallet,
} from "lucide-react";
import { href, Link } from "react-router";
import donation_form from "#/assets/images/donation-form.webp";
import laira_heart from "#/assets/laira/laira-heart.webp";
import { BOOK_A_DEMO } from "#/constants/urls";

const gift_types = [
  { name: "Card", Icon: CreditCard },
  { name: "Bank / ACH", Icon: Landmark },
  { name: "PayPal", Icon: Wallet },
  { name: "Apple / Google Pay", Icon: Smartphone },
  { name: "Stock", Icon: ChartSpline },
  { name: "DAF", Icon: HandCoins },
  { name: "IRA", Icon: Building2 },
  { name: "Crypto", Icon: Coins },
] as const;

/** each chip's lg anchor around the screenshot, reaching at most 14px inside
 *  the frame so it lands only on blank capture: the Card tab's top padding,
 *  the empty top-right corner, and the strip under "Continue with Card" (17px
 *  tall at the 1024 frame). below lg they sit in a row under it. */
const chips = [
  {
    label: "$0 platform fees",
    Icon: PiggyBank,
    at: "lg:-left-8 lg:-top-8",
  },
  {
    label: "Recurring giving built in",
    Icon: CalendarSync,
    at: "lg:-right-4 lg:-top-8",
  },
  {
    label: "Payouts within 5 working days",
    Icon: Landmark,
    at: "lg:-right-4 lg:-bottom-6",
  },
] as const;

interface IHero {
  classes?: string;
}

export function Hero({ classes = "" }: IHero) {
  return (
    <div
      className={`${classes} relative isolate overflow-clip bg-linear-to-b from-background to-band pt-12 pb-24 md:pt-20 md:pb-32`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 dot-grid dot-grid-fade"
      />
      <div className="page grid gap-16 lg:gap-12 lg:grid-cols-[11fr_9fr] items-center">
        <div className="grid gap-6 justify-items-start">
          <div className="flex flex-wrap gap-2">
            <Badge size="md" tone="secondary">
              Built by and for nonprofits
            </Badge>
            <Badge size="md" tone="secondary">
              Open source
            </Badge>
          </div>
          <h1 className="hero-heading">
            Every way to give.
            <br />
            One form.{" "}
            <em className="relative inline-block text-primary">
              Free forever.
              <svg
                aria-hidden="true"
                viewBox="0 0 300 16"
                preserveAspectRatio="none"
                className="absolute left-0 -bottom-2 h-3 w-full overflow-visible"
              >
                <path
                  d="M4 11C62 5 138 2 206 4c32 1 62 4 90 8"
                  pathLength={1}
                  vectorEffect="non-scaling-stroke"
                  className="fill-none stroke-amber-9 [stroke-linecap:round] [stroke-width:5] [stroke-dasharray:1] [stroke-dashoffset:0] starting:[stroke-dashoffset:1] transition-[stroke-dashoffset] duration-slow ease-out"
                />
              </svg>
            </em>
          </h1>
          <p className="text-lg/relaxed md:text-xl/relaxed text-pretty text-gray-11 max-w-xl">
            One brandable, embeddable donation form with $0 platform fees. Run
            by a volunteer-driven 501(c)(3), with open-source code you can
            verify yourself.
          </p>
          <ul className="grid grid-cols-2 sm:grid-cols-[repeat(4,auto)] sm:justify-start gap-x-6 gap-y-2.5 text-sm text-gray-12">
            {gift_types.map(({ name, Icon }) => (
              <li key={name} className="flex items-center gap-1.5">
                <Icon aria-hidden="true" className="icon-sm text-gray-11" />
                {name}
              </li>
            ))}
          </ul>
          <div className="flex max-sm:flex-col max-sm:justify-self-stretch sm:flex-wrap sm:items-center gap-3.5 mt-2">
            <Link
              to={href("/register")}
              className="group btn btn-lg btn-primary shadow-lift-cta gap-2"
            >
              Join free forever
              <ArrowRight
                aria-hidden="true"
                className="icon-md transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <ExtLink href={BOOK_A_DEMO} className="btn btn-lg btn-secondary">
              Book a demo
            </ExtLink>
          </div>
          <p className="text-sm text-gray-11">
            No platform fees, ever. We're funded by optional donor contributions
            at checkout.
          </p>
        </div>

        <div className="relative w-full max-w-lg justify-self-center lg:justify-self-end">
          <div className="overflow-hidden rounded border bg-panel shadow-lift-media">
            <img
              src={donation_form}
              width={746}
              height={540}
              alt="Better Giving embeddable donation form"
              fetchPriority="high"
              className="block w-full h-auto"
            />
          </div>
          {/* low enough that its in-frame corner stays on the blank sidebar under "Crypto" */}
          <Image
            src={laira_heart}
            width={120}
            alt="Laira holding a heart"
            className="absolute -bottom-16 -left-24 rotate-3 max-xl:hidden"
          />
          <ul className="mt-6 flex flex-wrap justify-center gap-2 lg:contents">
            {chips.map(({ label, Icon, at }) => (
              <li
                key={label}
                className={`flex items-center gap-2 rounded-full border bg-surface px-3.5 py-2 text-sm font-semibold text-gray-12 shadow-lift-card lg:absolute ${at}`}
              >
                <Icon aria-hidden="true" className="icon-md text-primary" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
