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

  return (
    <section
      aria-label="Donor messages"
      className={`flex flex-col gap-3 rounded p-5 md:flex-row md:items-center md:gap-6 md:p-6 ${t.ground} ${classes}`}
    >
      <span
        aria-hidden
        className={`text-4xl font-bold leading-none md:text-5xl ${t.mark}`}
      >
        “
      </span>
      <figure className="flex min-w-0 grow flex-col gap-1">
        <blockquote className="break-words md:text-lg">{m.message}</blockquote>
        <figcaption className={`text-sm ${t.meta}`}>{m.name}</figcaption>
      </figure>
      {(n > 1 || on_more) && (
        <div className="flex shrink-0 items-center gap-2 self-end md:self-auto">
          <p aria-live="polite" className={`text-sm ${t.meta}`}>
            <span aria-hidden>
              {at + 1} / {n}
            </span>
            <span className="sr-only">
              Message {at + 1} of {n}
            </span>
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
