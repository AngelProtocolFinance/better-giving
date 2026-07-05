import { href, Link } from "react-router";
import donation_form from "#/assets/images/donation-form.png";
import { ExtLink } from "#/components/ext-link";
import { BOOK_A_DEMO } from "#/constants/urls";

interface IHero {
  classes?: string;
}

export function Hero({ classes = "" }: IHero) {
  return (
    <div
      className={`${classes} bg-linear-to-b from-background to-accent px-6 pt-16 pb-18`}
    >
      <div className="max-w-6xl mx-auto grid gap-12 lg:grid-cols-[minmax(22rem,1fr)_minmax(18rem,32.5rem)] items-center">
        <div className="grid gap-5 justify-items-start">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Product
          </p>
          <h1 className="hero-heading">
            One form that turns visitors into donors, and donors into monthly
            givers
          </h1>
          <p className="text-lg/relaxed text-muted-fg max-w-lg text-pretty">
            Brandable, embeddable, and conversion-optimized: fewer clicks,
            express checkout, recurring giving, and every gift type, in one flow
            on your own website.
          </p>
          <div className="flex flex-wrap items-center gap-3.5 mt-1.5">
            <Link
              to={href("/register/welcome")}
              className="btn btn-primary px-7 py-3.5 shadow-lg shadow-primary/25"
            >
              Join free forever
            </Link>
            <ExtLink
              href={BOOK_A_DEMO}
              className="btn btn-secondary px-6 py-3.5"
            >
              Book a demo
            </ExtLink>
          </div>
        </div>

        <div className="relative max-lg:justify-self-center">
          <div
            className="absolute size-45 bg-secondary rounded-full -top-7 -right-4"
            aria-hidden
          />
          <div className="relative bg-card border border-border rounded-lg shadow-2xl shadow-primary/15 overflow-hidden">
            <img
              src={donation_form}
              alt="Better Giving embeddable donation form"
              className="block w-full h-auto"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
