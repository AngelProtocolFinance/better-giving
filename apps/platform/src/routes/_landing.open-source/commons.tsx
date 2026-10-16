import { ExtLink } from "@better-giving/ui";
import {
  ArrowRight,
  BadgePercent,
  HandCoins,
  Landmark,
  LockOpen,
  Users,
} from "lucide-react";
import type { CSSProperties } from "react";
import { GITHUB_REPO } from "#/constants/urls";

/** the paragraph's own terms, set as a ledger — nothing here it doesn't say */
const terms = [
  { Icon: Users, label: "Volunteer-driven" },
  {
    Icon: HandCoins,
    label: "Optional donor contributions",
    note: "Always opt-in, never pre-selected",
  },
  { Icon: BadgePercent, label: "No platform fees" },
  { Icon: Landmark, label: "No investors" },
  { Icon: LockOpen, label: "No gated features" },
] as const;

interface ICommons {
  classes?: string;
}

export function Commons({ classes = "" }: ICommons) {
  return (
    <section className={classes} aria-labelledby="commons-heading">
      <div className="page grid gap-14 lg:gap-20 lg:grid-cols-[1.1fr_0.9fr] items-center">
        <div className="grid justify-items-start max-w-prose">
          <h2 id="commons-heading" className="section-heading reveal">
            How the commons <em className="text-primary">stays free</em>
          </h2>
          <p className="mt-6 text-lg/relaxed text-gray-11 text-pretty">
            Better Giving is volunteer-driven and funded entirely by optional
            donor contributions at checkout. Always opt-in, never pre-selected.
            No platform fees, no investors, no gated features. Members who share
            the tools also share the responsibility of keeping them free for
            everyone. Want to contribute code, docs, or time? The repo is open.
          </p>
          <ExtLink
            href={GITHUB_REPO}
            className="mt-8 inline-flex items-center gap-1.5 text-lg font-bold link"
          >
            Contribute on GitHub
            <ArrowRight aria-hidden="true" className="icon-md" />
          </ExtLink>
        </div>

        {/* a restatement of the paragraph beside it, so it is hidden from
            assistive tech rather than read twice */}
        <ul
          aria-hidden="true"
          className="card shadow-lift-card grid divide-y reveal w-full max-w-lg justify-self-center lg:justify-self-end"
          style={{ "--reveal-order": 1 } as CSSProperties}
        >
          {terms.map(({ Icon, label, ...t }) => (
            <li
              key={label}
              className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
            >
              <span className="size-10 rounded-full bg-secondary text-primary grid place-items-center">
                <Icon className="icon-lg" />
              </span>
              <span className="grid gap-0.5">
                <span className="font-bold text-gray-12">{label}</span>
                {"note" in t && (
                  <span className="text-sm text-gray-11">{t.note}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
