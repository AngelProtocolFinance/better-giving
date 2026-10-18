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
import { BOOK_A_DEMO } from "#/constants/urls";
import { FormTour } from "#/pages/@sections/form-tour/form-tour";

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
    <div className={`${classes} pt-12 pb-8 md:pt-20 md:pb-12 xl:pt-0`}>
      <FormTour
        intro={
          <div className="grid gap-6 justify-items-start">
            <h1 className="hero-heading">
              Every way to give.
              <br />
              {"One form. Free\u00a0forever."}
            </h1>
            <p className="text-lg/relaxed md:text-xl/relaxed text-pretty text-gray-11 max-w-xl">
              One brandable, embeddable donation form. No platform fee while the
              optional donor contribution stays on (1.5% if you turn it off).
              Open-source code you can read.
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
              The optional donor contribution is opt-in and starts off. Turning
              that ask off is a 1.5% fee. Recurring giving built in.
            </p>
          </div>
        }
      />
    </div>
  );
}
