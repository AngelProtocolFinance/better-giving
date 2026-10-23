import { useId } from "react";
import type { IGiveItem, TOrgItem } from "../items";
import { ItemsByCount } from "../items-by-count";
import type { IOrgLayout } from "./types";

/** what shows in place of a list that failed to load */
export const FAILED_LINE: Record<keyof IOrgLayout["failed"], string> = {
  give: "We couldn't load this nonprofit's campaigns right now. Please try again later.",
  programs:
    "We couldn't load this nonprofit's programs right now. Please try again later.",
  videos:
    "We couldn't load this nonprofit's videos right now. Please try again later.",
};

/** the give list's name by what it holds; a list that failed to load holds
 * nothing and keeps the name its failure line uses */
export function give_label(give: IGiveItem[]): string {
  const only_supporter =
    give.length > 0 && give.every((x) => x.kind === "supporter");
  return only_supporter ? "Supporter campaigns" : "Campaigns";
}

const KINDS = ["give", "programs", "videos"] as const;

interface IWaysToHelp
  extends Pick<IOrgLayout, "give" | "programs" | "videos" | "failed" | "now"> {
  classes?: string;
}

/** every way to give past the hero, laid out by count, with a failed list's
 * line in its place. nothing to show and nothing failed leaves the section
 * out, and the hero carries the page */
export function WaysToHelp({
  classes = "",
  failed,
  now,
  ...lists
}: IWaysToHelp) {
  const heading_id = useId();
  const items = KINDS.flatMap<TOrgItem>((k) => (failed[k] ? [] : lists[k]));
  const failures = KINDS.filter((k) => failed[k]);
  if (items.length === 0 && failures.length === 0) return null;

  return (
    <section
      aria-labelledby={heading_id}
      className={`flex flex-col gap-3 md:gap-4 ${classes}`}
    >
      <h2 id={heading_id} className="text-xl font-bold md:text-2xl">
        Ways to help
      </h2>
      <ItemsByCount items={items} now={now} />
      {failures.map((k) => (
        <p key={k} className="text-sm text-gray-11">
          {FAILED_LINE[k]}
        </p>
      ))}
    </section>
  );
}
