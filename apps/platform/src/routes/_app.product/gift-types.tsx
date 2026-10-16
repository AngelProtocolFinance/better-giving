import {
  Building2,
  ChartSpline,
  Coins,
  CreditCard,
  HandCoins,
  Landmark,
  Plug,
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
  { title: "Crypto", body: "Accepted & liquidated to cash", Icon: Coins },
] as const;

interface IGiftTypes {
  classes?: string;
}

export function GiftTypes({ classes = "" }: IGiftTypes) {
  return (
    <section className={classes} aria-labelledby="gift-types-heading">
      <div className="page">
        <div className="grid justify-items-center text-center reveal">
          <p className="eyebrow text-primary">Payment aggregation</p>
          <h2
            id="gift-types-heading"
            className="section-heading mt-4 max-w-2xl"
          >
            Every way to give, <em className="text-primary">in one flow</em>
          </h2>
          <p className="mt-5 text-lg/relaxed text-gray-11 max-w-2xl text-pretty">
            Stop turning donors away. One integration covers everything. No
            extra portals, no added admin. Non-cash gifts are liquidated for you
            and granted as cash.
          </p>
        </div>

        <OneFlow />

        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8 mt-12 lg:mt-0">
          {gift_types.map(({ title, body, Icon }, i) => (
            <li
              key={title}
              className="card grid content-start gap-4 reveal"
              style={{ "--reveal-order": Math.floor(i / 4) } as CSSProperties}
            >
              <span
                aria-hidden="true"
                className="size-11 rounded-full bg-secondary text-primary grid place-items-center"
              >
                <Icon className="icon-xl" />
              </span>
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

/** lg only, where the four columns exist: one integration fanning out to the
 *  first row of tiles. each path ends on an eighth-point of the row (1/8,
 *  3/8…), which the gutter shifts off its column's centre by a few px but
 *  never out of the tile, so every line lands on a tile's top edge. */
function OneFlow() {
  return (
    <div
      aria-hidden="true"
      className="max-lg:hidden mt-14 grid justify-items-center"
    >
      <span className="flex items-center gap-2 rounded-full border bg-surface px-4 py-2 text-sm font-semibold text-gray-12 shadow-lift-card">
        <Plug className="icon-md text-primary" />
        One integration
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 800 72"
        preserveAspectRatio="none"
        className="block h-18 w-full overflow-visible"
      >
        {[100, 300, 500, 700].map((x) => (
          <path
            key={x}
            d={`M400 0 C400 40, ${x} 32, ${x} 72`}
            vectorEffect="non-scaling-stroke"
            className="fill-none stroke-gray-7 [stroke-width:2] [stroke-dasharray:6_6]"
          />
        ))}
      </svg>
    </div>
  );
}
