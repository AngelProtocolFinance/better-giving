import { CalendarClock, DoorOpen, FileDown } from "lucide-react";
import type { CSSProperties } from "react";

// each line is the home faq's own wording (`_landing._index/faqs.tsx`)
const items = [
  {
    Icon: CalendarClock,
    text: "Payouts arrive electronically within 5 working days.",
  },
  {
    Icon: FileDown,
    text: "Full donor-level data, exportable anytime (CSV and API) at no charge.",
  },
  { Icon: DoorOpen, text: "No exit fees, no fine print." },
] as const;

interface IIncludes {
  classes?: string;
}

export function Includes({ classes = "" }: IIncludes) {
  return (
    <section className={classes} aria-labelledby="includes-heading">
      <div className="page grid gap-10">
        <h2
          id="includes-heading"
          className="reveal eyebrow text-primary text-center"
        >
          What $0 includes
        </h2>
        <ul className="grid gap-8 md:grid-cols-3 md:gap-0 md:divide-x">
          {items.map(({ Icon, text }, i) => (
            <li
              key={text}
              className="reveal grid justify-items-center gap-4 text-center md:px-8"
              style={{ "--reveal-order": i } as CSSProperties}
            >
              <span
                aria-hidden
                className="size-12 rounded-full border bg-surface text-primary grid place-items-center"
              >
                <Icon className="icon-lg" />
              </span>
              <p className="text-base/relaxed font-semibold text-gray-12 text-balance max-w-xs">
                {text}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
