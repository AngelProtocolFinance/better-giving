import { href, Link } from "react-router";
import donation_form from "#/assets/images/donation-form.png";
import laira_heart from "#/assets/laira/laira-heart.webp";
import { ExtLink } from "#/components/ext-link";
import { Image } from "#/components/image";
import { BOOK_A_DEMO } from "#/constants/urls";

const gift_types = [
  "Card",
  "Bank / ACH",
  "PayPal",
  "Apple / Google Pay",
  "Stock",
  "DAF",
  "IRA",
  "Crypto",
] as const;

interface IHero {
  classes?: string;
}

export function Hero({ classes = "" }: IHero) {
  return (
    <div
      className={`${classes} bg-linear-to-b from-background to-accent px-6 pt-16 pb-18`}
    >
      <div className="max-w-6xl mx-auto grid gap-12 lg:grid-cols-[minmax(22rem,1fr)_minmax(18rem,33rem)] items-center">
        <div className="grid gap-5 justify-items-start">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-bold bg-secondary text-secondary-fg border border-border rounded-full px-4 py-2">
              Built by and for nonprofits
            </span>
            <span className="text-xs font-bold bg-secondary text-secondary-fg border border-border rounded-full px-4 py-2">
              Open source
            </span>
          </div>
          <h1 className="hero-heading">
            Every way to give.
            <br />
            One form. <span className="text-primary">Free forever.</span>
          </h1>
          <p className="text-lg/relaxed text-muted-fg max-w-lg text-pretty">
            One brandable, embeddable donation form with $0 platform fees. Run
            by a volunteer-driven 501(c)(3), with open-source code you can
            verify yourself.
          </p>
          <div className="flex flex-wrap gap-2 max-w-lg">
            {gift_types.map((g) => (
              <span
                key={g}
                className="text-xs font-medium bg-secondary text-secondary-fg rounded-full px-3.5 py-1.5"
              >
                {g}
              </span>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3.5 mt-2 w-full sm:w-auto">
            <Link
              to={href("/register/welcome")}
              className="btn btn-primary px-7 py-3.5 shadow-lg shadow-primary/25 w-full sm:w-auto"
            >
              Join free forever
            </Link>
            <ExtLink
              href={BOOK_A_DEMO}
              className="btn btn-secondary px-6 py-3.5 w-full sm:w-auto"
            >
              Book a demo
            </ExtLink>
          </div>
          <p className="text-sm text-muted-fg">
            No platform fees, ever. We're funded by optional donor contributions
            at checkout.
          </p>
        </div>

        <div className="relative max-lg:justify-self-center">
          <div
            className="absolute size-50 bg-secondary rounded-full -top-8 -right-4"
            aria-hidden
          />
          <div className="relative bg-card border border-border rounded-lg shadow-2xl shadow-primary/15 overflow-hidden -rotate-1">
            <img
              src={donation_form}
              alt="Better Giving embeddable donation form"
              className="block w-full h-auto"
            />
          </div>
          <Image
            src={laira_heart}
            width={150}
            alt="Laira holding a heart"
            className="absolute -bottom-9 -left-8 rotate-3 max-lg:hidden"
          />
        </div>
      </div>
    </div>
  );
}
