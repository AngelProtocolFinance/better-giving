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
      <div className="page grid gap-10 md:gap-12">
        <h2 id="includes-heading" className="reveal subsection-heading">
          What $0 includes
        </h2>
        <ul className="grid gap-8 md:grid-cols-3 md:gap-10">
          {items.map(({ Icon, text }, i) => (
            <li
              key={text}
              className="reveal grid content-start gap-4"
              style={{ "--reveal-order": i } as CSSProperties}
            >
              <Icon aria-hidden className="pictogram-sm text-primary" />
              <p className="text-lg/relaxed font-semibold text-gray-12 text-pretty max-w-xs">
                {text}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
