import { describe, expect, test } from "vitest";
import { sources_of } from "./conformance/walk";

/**
 * the sweep for a container-query step picked by eye rather than off the
 * ladder.
 *
 * the `--container-*` namespace cannot be closed the way `--text-*`,
 * `--radius-*` and the two shadow namespaces are in
 * `packages/ui/src/styles/theme.css`, because it is shared: `max-w-*` reads the
 * same keys, and 182 sites resolve through it today. a reset written for the
 * container-query steps would silently take every one of those widths down with
 * it. so, like the spacing and motion sets, this file is the entire gate rather
 * than the part the compiler cannot reach.
 *
 * the ladder is the nine steps the product actually stands on, one row each in
 * `packages/brand/design-system.md`. it is a subset of tailwind's namespace on
 * purpose: `xs` is a real key that only `max-w-*` spends, and `3xs`, `2xs` and
 * `7xl` are spent by nothing.
 *
 * ## what it reads for
 *
 * - **a step off the ladder**, unnamed (`@lg:`) or named (`@xl/steps:`), in
 *   either direction (`@max-3xl:`), and under any other prefix it is stacked
 *   with (`@lg:group-hover:`).
 * - **a bracket value.** `@[42rem]/steps:` compiles from its own text and never
 *   consults `--container-*`, so it is the one spelling no amount of ladder
 *   discipline reaches — the same hole `p-[13px]` opens in the spacing sweep.
 *   `@min-[…]:` and `@max-[…]:` are the same thing said the long way.
 *
 * scope is the container-query variant only. `max-w-*` shares the namespace but
 * answers to a different axis — a width cap on a line of text, not a layout
 * responding to the box it sits in — and is deliberately unread here. so is
 * `@container` itself: declaring a containment context is not a step, and the
 * names it declares (`steps`, `org-card`, `fund-card`, `frequency`, …) are
 * whatever the component calls itself.
 *
 * hence the `node` vitest project: the rest of the suite runs in browser mode,
 * which has no `node:fs`.
 */

/** comments blanked, newlines kept so line numbers still land. prose naming a
 *  variant — this file's own header, and the spacing sweep's — would otherwise
 *  score, and container queries reach the DOM through template literals and
 *  `classes` props as much as through `className="…"`, so the search runs over
 *  raw text. */
const uncommented = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^([ \t]*)\/\/.*$/gm, "$1");

const sources = sources_of(import.meta.url, uncommented);

const LADDER = new Set("sm md lg xl 2xl 3xl 4xl 5xl 6xl".split(" "));

/** the trailing `:` is what separates a variant from `@container/steps`, which
 *  declares the context and is not a step; the leading `(?<![-\w[])` keeps an
 *  `@` inside an identifier, a package scope or a bracket out. `min-`/`max-`
 *  are the two directions of one step, so the prefix is stripped before the
 *  step is read. */
const variant = /(?<![-\w[])@(max-|min-)?(\[[^\]]*\]|[a-z0-9]+)(\/[\w-]+)?:/g;

const line_of = (text: string, i: number) =>
  text.slice(0, i).split("\n").length;

interface Variant {
  /** `path:line variant` — a red run names the site without a re-scan */
  at: string;
  step: string;
  /** the container this variant is aimed at, `""` when it is the nearest one */
  container: string;
}

const parse = (file: string, text: string): Variant[] =>
  [...text.matchAll(variant)].map((m) => ({
    at: `${file}:${line_of(text, m.index)} ${m[0]}`,
    step: m[2],
    container: m[3]?.slice(1) ?? "",
  }));

const variants = sources.flatMap(({ file, text }) => parse(file, text));

describe("the container-query needle", () => {
  // a variant regex that silently matched nothing would turn both sweeps below
  // green, so the spellings the tree actually uses are read back here.
  const sample = parse(
    "f",
    `@sm:p-4 @max-3xl:text-center @xl/steps:divide-y @md/frequency:inline
     @lg:group-hover:bg-gray-3 @[42rem]/steps:min-w-48
     @container/org-card @container max-w-2xl @better-giving/ui`
  );

  test("every spelling in use parses into a step and a container", () => {
    expect(sample.map((v) => [v.step, v.container])).toEqual([
      ["sm", ""],
      ["3xl", ""],
      ["xl", "steps"],
      ["md", "frequency"],
      ["lg", ""],
      ["[42rem]", "steps"],
    ]);
  });

  test("the named containers in the tree are all seen", () => {
    const named = new Set(variants.map((v) => v.container).filter(Boolean));
    for (const name of ["steps", "org-card", "fund-card", "frequency"]) {
      expect([...named]).toContain(name);
    }
  });
});

describe("the container-query ladder", () => {
  test("every step is on it", () => {
    const offenders = variants
      .filter((v) => !v.step.startsWith("[") && !LADDER.has(v.step))
      .map((v) => v.at);
    expect(offenders).toEqual([]);
  });

  test("no bracket step", () => {
    // a width written in a bracket is a rung invented at the call site, and the
    // only one the ladder cannot be tightened to catch.
    const offenders = variants
      .filter((v) => v.step.startsWith("["))
      .map((v) => v.at);
    expect(offenders).toEqual([]);
  });
});
