import { describe, expect, test } from "vitest";
import { sources_of } from "./conformance/walk";

/**
 * the sweep for space measured by eye rather than spent by name.
 *
 * tailwind v4 computes every `p-*`/`m-*`/`gap-*` arithmetically from
 * `--spacing`, so there is no scale to close and nothing to reset: `py-22`,
 * `gap-4.5` and `px-6.5` each compile to a real length, render plausibly, and
 * are on no rung anything else in the product stands on. like the motion set
 * this file is the entire gate rather than the part the compiler cannot reach.
 *
 * the ladder below is tailwind's own documented default spacing scale — the
 * steps that thin out as they grow (…12, 14, 16, 20, 24…), which is what makes
 * a 22 or a 6.5 a step nobody chose so much as landed on. `auto` is a margin's
 * alone: it is centering, not a length, and `gap-auto` is not a thing.
 *
 * ## what it reads for
 *
 * - **a step off the ladder**, in any of the four families, under any variant
 *   (`md:`, `max-md:`, `hover:`, `@lg:`) and with a leading `-` for the
 *   negative margins.
 * - **a bracket value.** `p-[13px]` is compiled from its own text and never
 *   consults `--spacing`, so it is the one spelling no amount of ladder
 *   discipline reaches.
 *
 * `pr-(--gutter)` is not a finding: a custom-property reference defers to a
 * property declared elsewhere rather than carrying a length of its own, and the
 * one site that uses it pairs the padding with a `calc()` on that same var.
 * `p-[var(--x)]` is the same thing said in brackets and does fail here — write
 * the parenthesis form.
 *
 * scope is the spacing ladder only. `w-`/`h-`/`size-`/`top-` and friends read
 * from the same `--spacing` but answer to layout, not rhythm, and a
 * `grid-cols-[auto_1fr]` is a track list rather than a length — all of them are
 * a different axis and deliberately unread here.
 *
 * hence the `node` vitest project: the rest of the suite runs in browser mode,
 * which has no `node:fs`.
 */

/** comments blanked, newlines kept so line numbers still land. spacing reaches
 *  the DOM through template literals, `classes` props and `@apply` bodies as
 *  much as through `className="…"`, so this reads raw text — and the cost of
 *  reading everything is that prose naming a step it replaced would score. */
const uncommented = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^([ \t]*)\/\/.*$/gm, "$1");

const sources = sources_of(import.meta.url, uncommented);

const LADDER = new Set(
  `0 px 0.5 1 1.5 2 2.5 3 3.5 4 5 6 7 8 9 10 11 12 14 16 20 24 28 32 36 40 44
   48 52 56 60 64 72 80 96`.split(/\s+/)
);

/** longest family first so `gap-x-4` is read as `gap-x` + `4`; the leading
 *  `(?<![-\w])` is what keeps `translate-x-3`, `--spacing-4` and a `me` in an
 *  identifier out without any of them being named. */
const spacing =
  /(?<![-\w])-?(gap-x|gap-y|gap|space-x|space-y|px|py|pt|pr|pb|pl|ps|pe|p|mx|my|mt|mr|mb|ml|ms|me|m)-(\[[^\]]*\]|[\d.]+|px|auto)(?![-\w])/g;

const line_of = (text: string, i: number) =>
  text.slice(0, i).split("\n").length;

interface Step {
  /** `path:line class` — a red run names the site without a re-scan */
  at: string;
  family: string;
  value: string;
}

const steps: Step[] = sources.flatMap(({ file, text }) =>
  [...text.matchAll(spacing)].map((m) => ({
    at: `${file}:${line_of(text, m.index)} ${m[0]}`,
    family: m[1],
    value: m[2],
  }))
);

describe("the spacing ladder", () => {
  test("every padding, margin and gap step is on it", () => {
    const offenders = steps
      .filter(({ family, value }) => {
        if (value.startsWith("[")) return false; // the test below
        if (value === "auto") return !family.startsWith("m");
        return !LADDER.has(value);
      })
      .map((x) => x.at);
    expect(offenders).toEqual([]);
  });

  test("no bracket value in those families", () => {
    // a length written in a bracket is a rung invented at the call site, and
    // the only one the ladder cannot be tightened to catch.
    const offenders = steps
      .filter((x) => x.value.startsWith("["))
      .map((x) => x.at);
    expect(offenders).toEqual([]);
  });
});
