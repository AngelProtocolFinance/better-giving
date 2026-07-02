import { ArrowRight, Check } from "lucide-react";
import { ExtLink } from "#/components/ext-link";
import { GITHUB_REPO } from "#/constants/urls";
import {
  TermCmd,
  TermComment,
  TerminalCard,
  TermOk,
} from "#/pages/@sections/terminal-card";

const points = [
  "Verify, don't just trust — the full stack is public",
  "Self-host the form and own your gateway — zero intermediary",
  "Member-powered — the community keeps the commons free",
] as const;

interface IOpenSource {
  classes?: string;
}

export function OpenSource({ classes = "" }: IOpenSource) {
  return (
    <section className={classes} aria-labelledby="open-source-heading">
      <div className="max-w-6xl mx-auto grid gap-14 lg:grid-cols-[1.1fr_0.9fr] items-center">
        <div className="grid gap-4.5 justify-items-start">
          <p className="text-xs font-bold uppercase tracking-wider text-secondary">
            Open source
          </p>
          <h2
            id="open-source-heading"
            className="section-heading text-primary-fg"
          >
            Don't take our word for it. Read the code.
          </h2>
          <p className="text-primary-fg/80 leading-relaxed text-pretty">
            Every part of Better Giving is public — the donation form, the
            platform, all of it. That means trust is verifiable, not just
            promised. Most nonprofits use our managed platform for convenience;
            those who want full independence can self-host the form and own
            their own payment gateway.
          </p>
          <div className="grid gap-2.5 text-primary-fg font-medium text-sm">
            {points.map((p) => (
              <span key={p} className="flex items-center gap-2.5">
                <span
                  className="flex-none size-5.5 rounded-full bg-warning text-warning-fg grid place-items-center"
                  aria-hidden
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                {p}
              </span>
            ))}
          </div>
          <ExtLink
            href={GITHUB_REPO}
            className="btn btn-secondary gap-2 px-6 py-3.5 mt-2"
          >
            View the repository
            <ArrowRight className="size-4" />
          </ExtLink>
        </div>

        <TerminalCard label="better-giving / donation-form">
          <TermCmd>git clone github.com/better-giving/…</TermCmd>
          <TermComment>brandable, embeddable donation form</TermComment>
          <TermCmd>npm install &amp;&amp; npm run dev</TermCmd>
          <TermComment>your form, your gateway, your donors</TermComment>
          <TermOk>ready on localhost:3000</TermOk>
        </TerminalCard>
      </div>
    </section>
  );
}
