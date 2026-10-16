import { ExtLink } from "@better-giving/ui";
import { ArrowRight } from "lucide-react";
import { href, Link } from "react-router";
import { GITHUB_REPO } from "#/constants/urls";
import {
  TermCmd,
  TermComment,
  TerminalCard,
  TermOk,
} from "#/pages/@sections/terminal-card";

interface IHero {
  /** the ground comes from here — the inks below are `surface-deep`'s set */
  classes?: string;
}

export function Hero({ classes = "" }: IHero) {
  return (
    <div
      className={`${classes} relative isolate overflow-clip pt-16 pb-24 md:pt-24 md:pb-32`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 dot-grid dot-grid-fade"
      />
      <div className="page grid gap-16 lg:gap-12 lg:grid-cols-[1.05fr_0.95fr] items-center">
        <div className="grid gap-6 justify-items-start">
          <p className="eyebrow text-amber-6">Open Source</p>
          <h1 className="hero-heading max-w-lg">
            Trust you <em className="text-amber-6">can read</em>
          </h1>
          <p className="text-lg/relaxed md:text-xl/relaxed text-pretty text-blue-5 max-w-xl">
            Every part of Better Giving is public code: the donation form, the
            platform, all of it. When software moves money for your mission,
            "trust us" isn't enough. Verify us instead.
          </p>
          <div className="flex max-sm:flex-col max-sm:justify-self-stretch sm:flex-wrap sm:items-center gap-3.5 mt-2">
            <ExtLink
              href={GITHUB_REPO}
              className="group btn btn-lg btn-secondary gap-2"
            >
              View the repository
              <ArrowRight
                aria-hidden="true"
                className="icon-md transition-transform group-hover:translate-x-0.5"
              />
            </ExtLink>
            <Link to={href("/register")} className="btn btn-lg btn-outline">
              Join free forever
            </Link>
          </div>
        </div>

        <TerminalCard
          label="AngelProtocolFinance / better-giving"
          classes="w-full max-w-xl justify-self-center lg:justify-self-end"
          sequence
        >
          <TermCmd>
            git clone https://github.com/AngelProtocolFinance/better-giving
          </TermCmd>
          <TermComment>the whole platform: forms, flows, funds</TermComment>
          <TermCmd>pnpm install &amp;&amp; pnpm dev</TermCmd>
          <TermComment>your form, your gateway, your donors</TermComment>
          <TermOk>ready on localhost:3000</TermOk>
        </TerminalCard>
      </div>
    </div>
  );
}
