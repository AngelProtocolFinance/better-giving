import { ArrowRight } from "lucide-react";
import { useState } from "react";
import type { IDonorMessage } from "./items";

export interface IQuoteStrip {
  messages: IDonorMessage[];
  /** `light` on the page, `dark` on the brand's deep ground */
  tone: "light" | "dark";
  /** set while more pages exist. called when the reader reaches the last
   * loaded message, and again if they press next there before it lands, so
   * the caller drops a call made while its fetch is in flight */
  on_more?: () => void;
  classes?: string;
}

const TONE = {
  light: {
    ground: "bg-band text-gray-12",
    mark: "text-primary",
    meta: "text-gray-11",
    next: "link",
  },
  // white on the deep fill is Lc 99.6, and has no hover rung (ledger: the
  // --primary-fg alpha ladder is unmeasured)
  dark: {
    ground: "bg-primary-deep text-primary-fg",
    mark: "",
    meta: "",
    next: "focus-visible:outline-2 focus-visible:outline-primary-fg focus-visible:outline-offset-2",
  },
} as const;

/** one donor message at a time, with its donor and a next control; never the
 * amount. past the last loaded message it waits for `on_more`'s page, or
 * wraps to the first when there is none. nothing when there are no messages */
export function QuoteStrip({
  messages,
  tone,
  on_more,
  classes = "",
}: IQuoteStrip) {
  const [index, set_index] = useState(0);
  // the index the next page's first message will take, while waiting on it
  const [waiting_at, set_waiting_at] = useState<number | null>(null);
  const n = messages.length;

  if (waiting_at != null && n > waiting_at) {
    set_waiting_at(null);
    set_index(waiting_at);
  }

  if (n === 0) return null;
  const at = Math.min(index, n - 1);
  const m = messages[at];
  const t = TONE[tone];

  function next() {
    if (at < n - 1) {
      set_index(at + 1);
      if (at + 1 === n - 1) on_more?.();
      return;
    }
    if (on_more) {
      set_waiting_at(n);
      on_more();
      return;
    }
    set_index(0);
  }

  const has_next = n > 1 || !!on_more;

  // a phone has no room for the mark as a column: it opens the message
  // inline, and next shares the donor's line, laid over the caption's cell
  // so the message keeps the full width
  return (
    <section
      aria-label="Donor messages"
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center rounded p-5 md:flex md:gap-6 md:p-6 ${t.ground} ${classes}`}
    >
      <span
        aria-hidden
        className={`text-5xl font-bold leading-none max-md:hidden ${t.mark}`}
      >
        “
      </span>
      <figure className="col-span-full row-start-1 flex min-w-0 grow flex-col gap-1">
        <blockquote className="break-words md:text-lg">
          <span aria-hidden className={`font-bold md:hidden ${t.mark}`}>
            “{" "}
          </span>
          {m.message}
        </blockquote>
        <figcaption
          className={`text-sm ${t.meta} ${has_next ? "max-md:flex max-md:min-h-11 max-md:items-center max-md:pr-14" : ""}`}
        >
          {m.name}
        </figcaption>
      </figure>
      {has_next && (
        <div className="col-start-2 row-start-1 flex shrink-0 items-center gap-2 self-end">
          {/* the position alone: messages arrive a page at a time, so there
              is no total to give */}
          <p aria-live="polite" className="sr-only">
            Message {at + 1}
          </p>
          <button
            type="button"
            aria-label="Next message"
            onClick={next}
            className={`glyph-btn size-11 ${t.next}`}
          >
            <ArrowRight aria-hidden className="icon-lg" />
          </button>
        </div>
      )}
    </section>
  );
}
