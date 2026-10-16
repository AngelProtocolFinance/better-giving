import { ExtLink } from "@better-giving/ui";
import { ArrowRight } from "lucide-react";
import { href, Link } from "react-router";
import donation_form from "#/assets/images/donation-form.webp";
import { BOOK_A_DEMO } from "#/constants/urls";

interface IHero {
  classes?: string;
}

export function Hero({ classes = "" }: IHero) {
  return (
    <div className={`${classes} pt-12 pb-8 md:pt-20 md:pb-12`}>
      <div className="page grid gap-16 lg:gap-12 lg:grid-cols-[11fr_9fr] items-center">
        <div className="grid gap-6 justify-items-start">
          <h1 className="hero-heading">
            One form that turns visitors into donors, and donors into monthly
            givers
          </h1>
          <p className="text-lg/relaxed md:text-xl/relaxed text-pretty text-gray-11 max-w-xl">
            Brandable, embeddable, and conversion-optimized: fewer clicks,
            express checkout, recurring giving, and every gift type, in one flow
            on your own website.
          </p>
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
        </div>

        <div className="w-full max-w-lg justify-self-center lg:justify-self-end overflow-clip rounded border bg-panel">
          <img
            src={donation_form}
            width={746}
            height={540}
            alt="Better Giving donation form"
            fetchPriority="high"
            className="block w-full h-auto"
          />
        </div>
      </div>
    </div>
  );
}
