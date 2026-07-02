import { ArrowRight } from "lucide-react";
import { href, Link } from "react-router";
import laira_waiving from "#/assets/laira/laira-waiving.webp";
import { ExtLink } from "#/components/ext-link";
import { Image } from "#/components/image";
import { app_name } from "#/constants/env";
import { GITHUB_REPO } from "#/constants/urls";
import { metas } from "#/helpers/seo";
import { CtaBand } from "#/pages/@sections/cta-band";
import {
  TermCmd,
  TermComment,
  TerminalCard,
  TermOk,
} from "#/pages/@sections/terminal-card";
import type { Route } from "./+types/route";
import { TwoPaths } from "./two-paths";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({
    title: `Open Source | ${app_name}`,
    description:
      "Every part of Better Giving is public code — verify how donations are handled, self-host the form, and help keep the commons free.",
  });

const why = [
  {
    title: "Verify, don't trust",
    body: "Anyone — your board, your auditor, your most skeptical donor — can inspect exactly how donations are processed, routed, and receipted.",
  },
  {
    title: "Own your independence",
    body: "Self-host the donation form with your own payment gateway and merchant account. Your donor tokens never leave your control — nothing to migrate, ever.",
  },
  {
    title: "A commons that outlives us",
    body: "Public code can't be bought, gated, or shut away. The community keeps the infrastructure free for every nonprofit, forever.",
  },
] as const;

export default function Page() {
  return (
    <main>
      <div className="bg-primary px-6 pt-20 pb-22">
        <div className="max-w-6xl mx-auto grid gap-14 lg:grid-cols-[1.05fr_0.95fr] items-center">
          <div className="grid gap-5 justify-items-start">
            <p className="text-xs font-bold uppercase tracking-wider text-secondary">
              Open Source
            </p>
            <h1 className="hero-heading text-primary-fg">Trust you can read</h1>
            <p className="text-lg/relaxed text-primary-fg/80 max-w-lg text-pretty">
              Every part of Better Giving is public code — the donation form,
              the platform, all of it. When software moves money for your
              mission, "trust us" isn't enough. Verify us instead.
            </p>
            <div className="flex flex-wrap items-center gap-3.5 mt-1.5">
              <ExtLink
                href={GITHUB_REPO}
                className="btn btn-secondary gap-2 px-7 py-3.5"
              >
                View the repository
                <ArrowRight className="size-4" />
              </ExtLink>
              <Link
                to={href("/register/welcome")}
                className="btn rounded px-7 py-3.5 border-2 border-primary-fg/40 text-primary-fg hover:bg-primary-fg/10"
              >
                Join free forever
              </Link>
            </div>
          </div>
          <TerminalCard label="AngelProtocolFinance / better-giving">
            <TermCmd>
              git clone github.com/AngelProtocolFinance/better-giving
            </TermCmd>
            <TermComment>the whole platform — forms, flows, funds</TermComment>
            <TermCmd>npm install &amp;&amp; npm run dev</TermCmd>
            <TermComment>your form, your gateway, your donors</TermComment>
            <TermOk>ready on localhost:3000</TermOk>
          </TerminalCard>
        </div>
      </div>

      <div className="px-6 py-22">
        <div className="max-w-6xl mx-auto">
          <h2 className="section-heading text-center max-w-2xl mx-auto">
            Why an open-source commons?
          </h2>
          <div className="grid gap-5 md:grid-cols-3 mt-11">
            {why.map((w) => (
              <div
                key={w.title}
                className="bg-accent border border-border rounded-lg p-8 grid gap-2.5 content-start"
              >
                <span className="text-xl font-bold">{w.title}</span>
                <p className="text-sm/relaxed text-muted-fg">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <TwoPaths classes="bg-accent px-6 py-22" />

      <div className="px-6 py-22">
        <div className="max-w-3xl mx-auto grid gap-4.5 justify-items-center text-center">
          <Image
            src={laira_waiving}
            width={130}
            alt="Laira waving"
            className="mb-1"
          />
          <h2 className="section-heading">How the commons stays free</h2>
          <p className="text-muted-fg leading-relaxed max-w-2xl text-pretty">
            Better Giving is volunteer-driven and funded entirely by optional
            donor contributions at checkout — always opt-in, never pre-selected.
            No platform fees, no investors, no gated features. Members who share
            the tools also share the responsibility of keeping them free for
            everyone. Want to contribute code, docs, or time? The repo is open.
          </p>
          <ExtLink
            href={GITHUB_REPO}
            className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline"
          >
            Contribute on GitHub
            <ArrowRight className="size-4" />
          </ExtLink>
        </div>
      </div>

      <CtaBand
        title="Verify us. Then join us."
        subtitle="Read the code, kick the tires, and set up your form in an afternoon — free forever either way."
      />
    </main>
  );
}
