import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { ImageFrame, Progress } from "./give-card";
import type { IProgramItem } from "./items";

export interface IProgramRow {
  item: IProgramItem;
  classes?: string;
}

/** a program is a full-width row at any count: its 4:1 thumbnail on the left,
 * top-aligned, the text beside it. the title is the row's one link, stretched
 * over it */
export function ProgramRow({ item, classes = "" }: IProgramRow) {
  return (
    <article
      className={`relative grid grid-cols-[auto_minmax(0,1fr)_auto] overflow-hidden rounded border bg-panel text-gray-12 has-[h3_a:focus-visible]:outline-2 has-[h3_a:focus-visible]:outline-ring has-[h3_a:focus-visible]:-outline-offset-2 ${classes}`}
    >
      <ImageFrame src={item.image} classes="w-40 self-start md:w-56" />
      <div className="flex min-w-0 flex-col gap-2 p-4">
        <p className="eyebrow text-primary">Program</p>
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
