import { ExtLink, Image } from "@better-giving/ui";
import { ArrowRight } from "lucide-react";
import { href, Link } from "react-router";
import donation_form from "#/assets/images/donation-form.webp";
import laira_pointing from "#/assets/laira/laira-pointing.webp";
import { BOOK_A_DEMO } from "#/constants/urls";

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
          <p className="eyebrow text-primary">Product</p>
          <h1 className="hero-heading">
            One form that turns visitors into donors, and donors into{" "}
            <em className="text-primary">monthly givers</em>
          </h1>
          <p className="text-lg/relaxed md:text-xl/relaxed text-pretty text-gray-11 max-w-xl">
            Brandable, embeddable, and conversion-optimized: fewer clicks,
            express checkout, recurring giving, and every gift type, in one flow
            on your own website.
          </p>
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
        </div>

        <div className="relative w-full max-w-lg justify-self-center lg:justify-self-end">
          <div className="overflow-hidden rounded border bg-panel shadow-lift-media">
            <img
              src={donation_form}
              width={746}
              height={540}
              alt="Better Giving donation form"
              fetchPriority="high"
              className="block w-full h-auto"
            />
          </div>
          <Image
            src={laira_pointing}
            width={112}
            alt="Laira pointing at the donation form"
            className="absolute -bottom-10 -left-24 -rotate-3 max-lg:hidden"
          />
        </div>
      </div>
    </div>
  );
}
