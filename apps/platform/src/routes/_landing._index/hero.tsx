import { ExtLink } from "@better-giving/ui";
import {
  ArrowRight,
  Building2,
  ChartSpline,
  Coins,
  CreditCard,
  HandCoins,
  Landmark,
  Smartphone,
  Wallet,
} from "lucide-react";
import { href, Link } from "react-router";
import donation_form from "#/assets/images/donation-form.png";
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

interface IHero {
  classes?: string;
}

export function Hero({ classes = "" }: IHero) {
  return (
    <div className={`${classes} pt-12 pb-8 md:pt-20 md:pb-12`}>
      <div className="page grid gap-16 lg:gap-12 lg:grid-cols-[11fr_9fr] items-center">
        <div className="grid gap-6 justify-items-start">
          <h1 className="hero-heading">
            Every way to give.
            <br />
            {"One form. Free\u00a0forever."}
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
              className="group btn btn-lg btn-primary gap-2"
            >
              Join free forever
              <ArrowRight
                aria-hidden="true"
                className="icon-md transition-transform motion-safe:group-hover:translate-x-0.5"
              />
            </Link>
            <ExtLink href={BOOK_A_DEMO} className="btn btn-lg btn-secondary">
              Book a demo
            </ExtLink>
          </div>
          <p className="text-sm text-gray-11">
            No platform fees, ever. We're funded by optional donor contributions
            at checkout. Recurring giving built in. Payouts within 5 working
            days.
          </p>
        </div>

        <div className="w-full max-w-lg justify-self-center lg:justify-self-end overflow-clip rounded bg-panel">
          <img
            src={donation_form}
            width={757}
            height={625}
            alt="Better Giving embeddable donation form"
            fetchPriority="high"
            className="block w-full h-auto"
          />
        </div>
      </div>
    </div>
  );
}
