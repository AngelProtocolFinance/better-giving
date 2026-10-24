import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { ImageFrame, Progress } from "./give-card";
import type { IProgramItem } from "./items";

export interface IProgramRow {
  item: IProgramItem;
  /** the "Program" line: set where the list mixes kinds, see `names_kind` */
  show_kind: boolean;
}

/** a program is a full-width row at any count: from sm its 4:1 thumbnail
 * inside the row's inset, centred against the text beside it; a phone has no
 * room for both, so the image runs across the top. the title is the row's one
 * link, stretched over it */
export function ProgramRow({ item, show_kind }: IProgramRow) {
  return (
    <article className="relative grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto] overflow-hidden rounded border bg-panel text-gray-12 has-[h3_a:focus-visible]:outline-2 has-[h3_a:focus-visible]:outline-ring has-[h3_a:focus-visible]:-outline-offset-2">
      <ImageFrame
        src={item.image}
        classes="col-span-full sm:col-span-1 sm:my-4 sm:ml-4 sm:w-40 sm:self-center sm:rounded lg:w-48"
      />
      <div className="flex min-w-0 flex-col gap-2 p-4">
        {show_kind && <p className="eyebrow text-primary">Program</p>}
        <h3 className="font-bold">
          <Link
            to={item.to}
            className="outline-0 after:absolute after:inset-0 after:content-['']"
          >
            {item.title}
          </Link>
        </h3>
        {item.summary && (
          <p className="line-clamp-2 text-sm text-gray-11">{item.summary}</p>
        )}
        {item.goal != null && (
          <Progress title={item.title} raised={item.raised} goal={item.goal} />
        )}
      </div>
      <span className="flex items-center pr-4">
        <ChevronRight aria-hidden className="icon-md text-gray-11" />
      </span>
    </article>
  );
}
