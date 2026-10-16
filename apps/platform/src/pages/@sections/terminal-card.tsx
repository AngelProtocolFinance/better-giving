import type React from "react";
import { Children } from "react";

interface ITerminalCard {
  label: string;
  classes?: string;
  /** reveal the body lines one after another as the card scrolls in */
  sequence?: boolean;
  /** body lines — use `term-cmd`/`term-comment`/`term-ok` helpers below */
  children: React.ReactNode;
}

/** illustrative repo terminal — content is decorative, not real commands.
 *  drawn for a brand ground (`surface-primary` or `surface-deep`): its body
 *  ink and hairlines are `--primary-fg` steps over its own black scrim. */
export function TerminalCard({
  label,
  classes = "",
  sequence = false,
  children,
}: ITerminalCard) {
  return (
    // the media lift, not the card one: this sits on a brand ground, where the
    // card lift's primary-at-5% composites onto primary and paints nothing.
    <div
      className={`${classes} bg-black/25 border border-primary-fg/15 rounded overflow-hidden shadow-lift-media`}
    >
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-primary-fg/10 bg-black/15">
        <span className="size-3 rounded-full bg-destructive" />
        <span className="size-3 rounded-full bg-warning" />
        <span className="size-3 rounded-full bg-success" />
        <span className="font-mono text-xs text-primary-fg/80 ml-2 truncate">
          {label}
        </span>
        <span className="font-mono text-2xs text-primary-fg/80 border border-primary-fg/25 rounded-full px-2 py-0.5 ml-auto">
          Public
        </span>
      </div>
      <div className="px-5 md:px-6 py-5 font-mono text-xs/loose md:text-sm/loose text-primary-fg/75 break-words">
        {sequence
          ? Children.toArray(children).map((line, i) => (
              <div
                key={i}
                className="reveal"
                // reveal's stagger stops at its fourth step
                style={
                  { "--reveal-order": Math.min(i, 3) } as React.CSSProperties
                }
              >
                {line}
              </div>
            ))
          : children}
      </div>
    </div>
  );
}

interface ITermLine {
  children: React.ReactNode;
}

export function TermCmd({ children }: ITermLine) {
  return (
    <p>
      {/* step 9, not the -subtle-fg ink rung: this card's ground is bg-black/25
          over a brand fill, and the ink rungs are tuned to sit ON light. on
          the dark panel step 11 goes under the body copy beside it. */}
      <span className="text-warning">$</span> {children}
    </p>
  );
}

export function TermComment({ children }: ITermLine) {
  return <p className="text-primary-fg/70"># {children}</p>;
}

export function TermOk({ children }: ITermLine) {
  return (
    <p>
      {/* a character, not an icon: it holds the prompt column the `$` sets */}
      <span className="text-secondary" aria-hidden>
        ✓
      </span>{" "}
      {children}
    </p>
  );
}
