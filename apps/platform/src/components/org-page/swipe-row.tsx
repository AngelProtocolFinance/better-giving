import { useId, useState } from "react";
import { GiveCard } from "./give-card";
import type { IGiveItem } from "./items";

export interface ISwipeRow {
  /** the section's heading, which also names the scrolling row */
  heading: string;
  /** 4 or more: fewer is `ItemsByCount`'s */
  items: IGiveItem[];
  /** epoch ms, see `GiveCard` */
  now: number;
  classes?: string;
}

/** 4+ campaigns and supporter campaigns as one row that scrolls sideways. each card
 * is a share of the row's width, so the last one in view is always cut off,
 * which is what says there is more. "See all N" opens the row in place into a
 * wrapping grid */
export function SwipeRow({ heading, items, now, classes = "" }: ISwipeRow) {
  const id = useId();
  const heading_id = `${id}-heading`;
  const list_id = `${id}-list`;
  const [expanded, set_expanded] = useState(false);

  return (
    <div className={`flex flex-col gap-3 ${classes}`}>
      <div className="flex items-baseline gap-3">
        <h2 id={heading_id} className="grow text-xl font-bold lg:text-2xl">
          {heading}
        </h2>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={list_id}
          onClick={() => set_expanded((x) => !x)}
          className="link min-h-11 shrink-0 font-semibold"
        >
          {expanded ? "Show fewer" : `See all ${items.length}`}
        </button>
      </div>
      {expanded ? (
        <ul
          id={list_id}
          data-count={items.length}
          className="grid gap-4 md:grid-cols-3"
        >
          {items.map((x) => (
            <li key={x.id}>
              <GiveCard item={x} orientation="vertical" now={now} />
            </li>
          ))}
        </ul>
      ) : (
        <section
          id={list_id}
          aria-labelledby={heading_id}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: WCAG 2.1.1 — a scroll container is otherwise reachable only by pointer
          tabIndex={0}
          className="snap-x snap-mandatory overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
        >
          <ul className="grid auto-cols-[75%] grid-flow-col gap-4 md:auto-cols-[30%]">
            {items.map((x) => (
              <li key={x.id} className="snap-start">
                <GiveCard item={x} orientation="tile" now={now} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
