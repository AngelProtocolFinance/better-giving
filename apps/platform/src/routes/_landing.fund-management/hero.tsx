import { ExtLink, Image } from "@better-giving/ui";
import { ArrowRight } from "lucide-react";
import { href, Link } from "react-router";
import laira_coin from "#/assets/laira/laira-coin.webp";
import { BOOK_A_DEMO } from "#/constants/urls";
import { SplitDiagram } from "./split-diagram";

interface IHero {
  classes?: string;
}

export function Hero({ classes = "" }: IHero) {
  return (
    <div className={`${classes} overflow-clip pt-12 pb-24 md:pt-20 md:pb-32`}>
      <div className="page grid gap-16 lg:gap-12 lg:grid-cols-[8fr_5fr] items-center">
        <div className="grid gap-6 justify-items-start">
          <h1 className="hero-heading">
            This quarter's gifts, next decade's reserves
          </h1>
          <p className="text-lg/relaxed md:text-xl/relaxed text-pretty text-gray-11 max-w-xl">
            Choose what share of each donation is granted to your bank, held in
            high-yield savings, or invested in the Sustainability Fund. Change
            the split anytime. Returns vary, and past performance isn't a
            guarantee.
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
        <div className="relative w-full max-w-lg justify-self-center lg:justify-self-end">
          <SplitDiagram />
          <Image
            src={laira_coin}
            width={112}
            alt=""
            className="absolute -top-14 -inset-e-8 rotate-6 max-lg:hidden"
          />
        </div>
      </div>
    </div>
  );
}
