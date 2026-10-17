import { ExtLink } from "@better-giving/ui";
import {
  ArrowRight,
  BadgePercent,
  HandCoins,
  ToggleLeft,
  Users,
} from "lucide-react";
import type { CSSProperties } from "react";
import { GITHUB_REPO } from "#/constants/urls";

/** the paragraph's own terms, set as a ledger — nothing here it doesn't say */
const terms = [
  {
    Icon: HandCoins,
    label: "Optional donor contribution",
    note: "Opt-in, and starts off",
  },
  {
    Icon: BadgePercent,
    label: "No platform fee",
    note: "While that ask stays on the form",
  },
  { Icon: ToggleLeft, label: "1.5% fee", note: "If you turn the ask off" },
  { Icon: Users, label: "Open to contributors", note: "Code, docs, or time" },
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
            How the commons stays free
          </h2>
          <p className="mt-6 text-lg/relaxed text-gray-11 text-pretty">
            Donors can add an optional contribution at checkout. It is opt-in
            and starts off. There is no platform fee while that ask stays on the
            form. Turning it off is a 1.5% fee. Want to contribute code, docs,
            or time? The repo is open.
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
          className="tile grid gap-6 reveal w-full max-w-lg justify-self-center lg:justify-self-end"
          style={{ "--reveal-order": 1 } as CSSProperties}
        >
          {terms.map(({ Icon, label, note }) => (
            <li key={label} className="flex items-center gap-4">
              <span className="flex-none size-10 rounded-full bg-surface text-primary grid place-items-center">
                <Icon className="icon-lg" />
              </span>
              <span className="grid gap-0.5">
                <span className="font-bold text-gray-12">{label}</span>
                <span className="text-sm text-gray-11">{note}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
