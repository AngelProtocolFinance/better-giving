import { useEffect, useRef, useState } from "react";
import { GiveCard } from "./give-card";
import type { IGiveItem, IProgramItem, IVideoItem, TOrgItem } from "./items";
import { ProgramRow } from "./program-row";
import { VideoSet } from "./video-set";

export interface IItemsByCount {
  items: TOrgItem[];
  /** epoch ms, see `GiveCard` */
  now: number;
  /** every campaign a `horizontal` row, one per line, whatever the count, so
   * it lines up with the program rows: a reading column's list */
  rows?: boolean;
}

/** a list laid out by its own count, never leaving an empty slot: 1 is a
 * feature card, 2 halves, 3 thirds, 4+ the first 3 and "See all N". programs
 * are rows and videos follow their own rule whatever the count, so a mixed
 * list renders campaigns and supporter campaigns, then programs, then videos. on a
 * phone every count is a single stack. nothing for no items */
export function ItemsByCount({ items, now, rows = false }: IItemsByCount) {
  if (items.length === 0) return null;
  const give = items.filter(
    (x): x is IGiveItem => x.kind === "campaign" || x.kind === "supporter"
  );
  const programs = items.filter((x): x is IProgramItem => x.kind === "program");
  const videos = items.filter((x): x is IVideoItem => x.kind === "video");
  return (
    <div className="flex flex-col gap-4">
      {give.length > 0 &&
        (rows ? (
          <ul data-count={give.length} className="grid gap-4">
            {give.map((x) => (
              <li key={x.id}>
                <GiveCard item={x} orientation="horizontal" now={now} />
              </li>
            ))}
          </ul>
        ) : (
          <GiveByCount items={give} now={now} />
        ))}
      {programs.length > 0 && (
        <ul data-count={programs.length} className="grid gap-4">
          {programs.map((p) => (
            <li key={p.id}>
              <ProgramRow item={p} />
            </li>
          ))}
        </ul>
      )}
      <VideoSet videos={videos} />
    </div>
  );
}

interface IGiveByCount {
  items: IGiveItem[];
  now: number;
}

function GiveByCount({ items, now }: IGiveByCount) {
  const n = items.length;
  if (n > 3) {
    return (
      <RevealGrid
        items={items}
        now={now}
        first={{ phone: 3, wide: 3 }}
        label={(_, total) => `See all ${total}`}
      />
    );
  }
  const [grid, orientation] =
    n === 1
      ? (["", "feature"] as const)
      : n === 2
        ? (["md:grid-cols-2", "horizontal"] as const)
        : (["md:grid-cols-3", "vertical"] as const);
  return (
    <ul data-count={n} className={`grid gap-4 ${grid}`}>
      {items.map((x) => (
        <li key={x.id}>
          <GiveCard item={x} orientation={orientation} now={now} />
        </li>
      ))}
    </ul>
  );
}

export interface IShowMoreGrid {
  /** one kind, as a tab holds it */
  items: (IGiveItem | IProgramItem)[];
  /** epoch ms, see `GiveCard` */
  now: number;
}

/** a tab's content: the first 6 in three columns (3 on a phone), and "Show N
 * more" for the rest. programs stay full-width rows */
export function ShowMoreGrid({ items, now }: IShowMoreGrid) {
  return (
    <RevealGrid
      items={items}
      now={now}
      first={{ phone: 3, wide: 6 }}
      label={(hidden) => `Show ${hidden} more`}
    />
  );
}

/** matches tailwind's `md`, the width the grid turns to three columns */
const WIDE = "(width >= 48rem)";

interface IRevealGrid {
  items: (IGiveItem | IProgramItem)[];
  now: number;
  /** how many show before the reveal, under and from `md` */
  first: { phone: number; wide: number };
  label: (hidden: number, total: number) => string;
}

/** the rest are in the dom from the start, hidden by css alone, so the server
 * render needs no viewport. the reveal is one way: its button goes, and focus
 * moves to the first item it brought in */
function RevealGrid({ items, now, first, label }: IRevealGrid) {
  const [revealed_from, set_revealed_from] = useState<number | null>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (revealed_from == null) return;
    list.current?.children[revealed_from]?.querySelector("a")?.focus();
  }, [revealed_from]);

  const n = items.length;
  const open = revealed_from != null;
  const hidden_phone = Math.max(0, n - first.phone);
  const hidden_wide = Math.max(0, n - first.wide);

  function held(i: number): string {
    if (open) return "";
    if (i >= first.wide) return "hidden";
    if (i >= first.phone) return "max-md:hidden";
    return "";
  }

  return (
    <div className="flex flex-col gap-4">
      <ul ref={list} data-count={n} className="grid gap-4 md:grid-cols-3">
        {items.map((x, i) =>
          x.kind === "program" ? (
            <li key={x.id} className={`col-span-full ${held(i)}`}>
              <ProgramRow item={x} />
            </li>
          ) : (
            <li key={x.id} className={held(i)}>
              <GiveCard item={x} orientation="vertical" now={now} />
            </li>
          )
        )}
      </ul>
      {!open && hidden_phone > 0 && (
        <button
          type="button"
          onClick={() =>
            set_revealed_from(
              window.matchMedia(WIDE).matches ? first.wide : first.phone
            )
          }
          className={`btn btn-secondary self-center ${hidden_wide === 0 ? "md:hidden" : ""}`}
        >
          {hidden_phone === hidden_wide ? (
            label(hidden_wide, n)
          ) : (
            <>
              <span className="md:hidden">{label(hidden_phone, n)}</span>
              <span className="max-md:hidden">{label(hidden_wide, n)}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
