import { ExtLink } from "@better-giving/ui";
import { ArrowRight, Check } from "lucide-react";
import type React from "react";
import { GITHUB_REPO } from "#/constants/urls";
import {
  TermCmd,
  TermComment,
  TerminalCard,
  TermOk,
} from "#/pages/@sections/terminal-card";

const points = [
  "Verify, don't just trust: the full stack is public",
  "Read how a donation is processed, settled, and receipted",
  "Contributions of code and docs are welcome",
] as const;

interface IOpenSource {
  /** the ground comes from here — the inks below are `surface-deep`'s set */
  classes?: string;
}

export function OpenSource({ classes = "" }: IOpenSource) {
  return (
    <section className={classes} aria-labelledby="open-source-heading">
      <div className="page grid gap-14 lg:gap-20 lg:grid-cols-[1.1fr_0.9fr] items-center">
        <div className="grid gap-5 justify-items-start">
          <div className="grid gap-5 reveal">
            <h2 id="open-source-heading" className="section-heading">
              Don't take our word for it. Read the code.
            </h2>
            <p className="text-blue-5 text-lg/relaxed text-pretty max-w-xl">
              Every part of Better Giving is public: the donation form, the
              platform, all of it. That means trust is verifiable, not just
              promised. Nonprofits join the managed platform.
            </p>
          </div>
          <ul className="grid gap-3 font-medium mt-1">
            {points.map((p, i) => (
              <li
                key={p}
                className="flex items-start gap-3 reveal"
                style={{ "--reveal-order": i + 1 } as React.CSSProperties}
              >
                <span
                  className="flex-none size-6 rounded-full bg-success text-success-fg grid place-items-center"
                  aria-hidden
                >
                  <Check className="icon-sm" strokeWidth={3} />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <ExtLink
            href={GITHUB_REPO}
            className="btn btn-lg btn-secondary gap-2 mt-4"
          >
            View the repository
            <ArrowRight className="icon-md" />
          </ExtLink>
        </div>

        <TerminalCard
          label="AngelProtocolFinance / better-giving"
          description="Illustration: opening the public Better Giving repository to read how a gift is processed"
          sequence
        >
          <TermComment>public source for the managed platform</TermComment>
          <TermCmd>
            gh repo view AngelProtocolFinance/better-giving --web
          </TermCmd>
          <TermComment>donation form, settlement, receipts</TermComment>
          <TermComment>read how a gift is processed</TermComment>
          <TermOk>open on GitHub</TermOk>
        </TerminalCard>
      </div>
    </section>
  );
}
