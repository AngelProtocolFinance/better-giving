import {
  Building2,
  ChartSpline,
  Coins,
  CreditCard,
  HandCoins,
  Landmark,
  Smartphone,
  Wallet,
} from "lucide-react";
import type { CSSProperties } from "react";

const gift_types = [
  {
    title: "Card",
    body: "Credit & debit, with express checkout",
    Icon: CreditCard,
  },
  { title: "Bank / ACH", body: "Lowest-fee direct transfers", Icon: Landmark },
  {
    title: "PayPal & Venmo",
    body: "One-tap for millions of donors",
    Icon: Wallet,
  },
  {
    title: "Apple / Google Pay",
    body: "Express mobile checkout",
    Icon: Smartphone,
  },
  {
    title: "Stock",
    body: "Larger gifts, tax benefits for donors",
    Icon: ChartSpline,
  },
  {
    title: "Donor-Advised Funds",
    body: "DAFpay via Chariot, built in",
    Icon: HandCoins,
  },
  {
    title: "IRA / QCD",
    body: "Qualified charitable distributions",
    Icon: Building2,
  },
  { title: "Crypto", body: "We accept crypto gifts", Icon: Coins },
] as const;

interface IGiftTypes {
  classes?: string;
}

export function GiftTypes({ classes = "" }: IGiftTypes) {
  return (
    <section className={classes} aria-labelledby="gift-types-heading">
      <div className="page grid gap-12 lg:gap-16 lg:grid-cols-[2fr_3fr] items-start">
        <div className="grid gap-5 reveal">
          <h2 id="gift-types-heading" className="section-heading">
            Every way to give, in one flow
          </h2>
          <p className="text-lg/relaxed text-gray-11 text-pretty">
            Stop turning donors away. One integration covers everything. No
            extra portals, no added admin. We accept stock and crypto gifts.
          </p>
        </div>

        <ul className="tile grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {gift_types.map(({ title, body, Icon }, i) => (
            <li
              key={title}
              className="grid grid-cols-[auto_1fr] gap-x-4 reveal"
              style={{ "--reveal-order": Math.floor(i / 2) } as CSSProperties}
            >
              <Icon aria-hidden="true" className="icon-xl text-primary" />
              <div className="grid gap-1">
                <h3 className="font-bold text-gray-12">{title}</h3>
                <p className="text-sm/normal text-gray-11">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
