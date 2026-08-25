import { ExtLink } from "@better-giving/ui";
import { href, Link } from "react-router";
import { BOOK_A_DEMO } from "#/constants/urls";

interface IHero {
  classes?: string;
}

export function Hero({ classes = "" }: IHero) {
  return (
    <div
      className={`${classes} grid max-lg:justify-items-center max-lg:text-center`}
    >
      <p className="eyebrow text-primary">For U.S. nonprofits</p>
      <h1 className="hero-heading mt-4 max-w-4xl">
        Fundraising you can audit. Free, forever.
      </h1>
      <p className="section-body mt-5 max-w-2xl text-gray-11">
        Accept cards, bank, stocks, DAFs, and crypto with $0 platform fees. Our
        code is public, so you can verify it.
      </p>
      {/* only while the form sits beside this copy. once the columns stack the
          form is directly below, and its own submit is the primary action —
          two "join free forever" buttons a screen apart is one too many. the
          demo link moves inside the form to keep that door open. */}
      <div className="max-lg:hidden flex flex-wrap gap-3.5 mt-7">
        <Link to={href("/register")} className="btn btn-lg btn-primary">
          Join free forever
        </Link>
        <ExtLink href={BOOK_A_DEMO} className="btn btn-lg btn-secondary">
          Book a demo
        </ExtLink>
      </div>
    </div>
  );
}
