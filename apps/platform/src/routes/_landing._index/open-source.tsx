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
  "Self-host the form and own your gateway: zero intermediary",
  "Member-powered: the community keeps the commons free",
] as const;

interface IOpenSource {
  /** the ground comes from here — the inks below are `surface-deep`'s set */
  classes?: string;
}

export function OpenSource({ classes = "" }: IOpenSource) {
  return (
    <section
      className={`${classes} relative overflow-hidden`}
      aria-labelledby="open-source-heading"
    >
      <div className="absolute inset-0 dot-grid dot-grid-fade" aria-hidden />
      <div className="page relative grid gap-14 lg:gap-20 lg:grid-cols-[1.1fr_0.9fr] items-center">
        <div className="grid gap-5 justify-items-start">
          <div className="grid gap-5 reveal">
            <p className="eyebrow text-amber-6">Open source</p>
            <h2 id="open-source-heading" className="section-heading">
              {"Don't take our word for it. "}
              <em className="text-amber-6">Read the code.</em>
            </h2>
            <p className="text-blue-5 text-lg/relaxed text-pretty max-w-xl">
              Every part of Better Giving is public: the donation form, the
              platform, all of it. That means trust is verifiable, not just
              promised. Most nonprofits use our managed platform for
              convenience; those who want full independence can self-host the
              form and own their own payment gateway.
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
          label="better-giving / donation-form"
          description="Illustration: cloning and running the open-source donation form"
          sequence
        >
          <TermCmd>git clone https://github.com/better-giving/…</TermCmd>
          <TermComment>brandable, embeddable donation form</TermComment>
          <TermCmd>pnpm install &amp;&amp; pnpm dev</TermCmd>
          <TermComment>your form, your gateway, your donors</TermComment>
          <TermOk>ready on localhost:3000</TermOk>
        </TerminalCard>
      </div>
    </section>
  );
}
