import type React from "react";
import { Children } from "react";

interface ITerminalCard {
  /** the window title — drawn, not read */
  label: string;
  /** what the drawing shows: the card is one image to assistive tech, and its
   *  lines are illustrative, not commands to copy */
  description: string;
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
  description,
  classes = "",
  sequence = false,
  children,
}: ITerminalCard) {
  return (
    // no lift: it sits at rest on its brand ground, set off by its own darker
    // scrim, and its edge is the window frame it draws. `clip` is no scroll
    // container, so as a grid item it keeps its min-content floor; min-w-0
    // lets a long command wrap rather than widen the column
    <div
      className={`${classes} bg-black/25 border border-primary-fg/15 rounded overflow-clip min-w-0`}
      role="img"
      aria-label={description}
    >
      <div
        className="flex items-center gap-2 px-5 py-3.5 border-b border-primary-fg/10 bg-black/15"
        aria-hidden
      >
        <span className="size-3 rounded-full bg-destructive" />
        <span className="size-3 rounded-full bg-warning" />
        <span className="size-3 rounded-full bg-success" />
        <span className="font-mono text-xs text-primary-fg/80 ms-2 truncate">
          {label}
        </span>
        <span className="font-mono text-2xs text-primary-fg/80 border border-primary-fg/25 rounded-full px-2 py-0.5 ms-auto">
          Public
        </span>
      </div>
      <div
        className="px-5 md:px-6 py-5 font-mono text-xs/loose md:text-sm/loose text-primary-fg/75 break-words"
        aria-hidden
      >
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
