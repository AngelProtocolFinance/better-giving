import { href, Link } from "react-router";
import { ExtLink } from "#/components/ext-link";
import { BOOK_A_DEMO } from "#/constants/urls";

interface IHero {
  classes?: string;
}

export function Hero({ classes = "" }: IHero) {
  return (
    <div className={`${classes} grid justify-items-center text-center`}>
      <p className="eyebrow text-primary">For U.S. nonprofits</p>
      <h1 className="hero-heading mt-4 max-w-4xl">
        Fundraising you can audit. Free, forever.
      </h1>
      <p className="section-body mt-5 max-w-2xl text-muted-fg">
        Accept cards, bank, stocks, DAFs, and crypto with $0 platform fees. Our
        code is public, so you can verify it.
      </p>
      <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3.5 mt-7 w-full sm:w-auto">
        <Link
          to={href("/register")}
          className="btn btn-primary px-7 py-3.5 w-full sm:w-auto"
        >
          Join free forever
        </Link>
        <ExtLink
          href={BOOK_A_DEMO}
          className="btn btn-secondary px-7 py-3.5 w-full sm:w-auto"
        >
          Book a demo
        </ExtLink>
      </div>
    </div>
  );
}
