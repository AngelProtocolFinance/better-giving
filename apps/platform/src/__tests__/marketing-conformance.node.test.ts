import { describe, expect, test } from "vitest";
import { sources_of } from "./conformance/walk";

/**
 * the sweep for the marketing house rules (packages/brand/design-system.md →
 * "Marketing house rules"): the devices that read as generated, banned on the
 * public marketing pages and nowhere else. every one of them compiles, paints
 * and looks deliberate in review — an accent word in a heading, an uppercase
 * kicker over it, a glow, a lift on a resting card — so no closed namespace
 * catches them. this file reads the source instead.
 *
 * the scope is the ledger's: the `_landing*` routes, `_app.about-us`,
 * `_app.product`, `pages/@sections/`, the marketing header, the chrome banner
 * and the footer. product UI keeps `card`, `eyebrow` and its lifts; a needle
 * here says nothing about a dashboard.
 *
 * ## what it reads, and what it cannot
 *
 * - **the distinctive needles are read as raw text** with comments blanked
 *   (the ledger prose and these files' own notes name every one of them), so a
 *   class bundle hoisted into a `const` is caught as surely as a `className`.
 * - **`card` is too common a word for that**, so it is read only as a token of
 *   a `className=`/`classes=` value — quoted, or a `{`…`}` template whose
 *   ternary branches carry their own quotes.
 * - **a heading's content handed in as a prop** (`<h2 className=
 *   "section-heading">{title}</h2>`) is opaque here: an `<em>` inside `title`
 *   lands in another file. likewise a second ink on a `<span>` inside a
 *   heading — the rule bans it, the sweep does not look for it.
 * - **hairlines, numbering and centring** are in the rules and not in here:
 *   each has a legitimate shape (a control's edge, a real `<ol>`, the one
 *   centred moment) that a text match cannot tell from the device.
 *
 * hence the `node` vitest project: the rest of the suite runs in browser mode,
 * which has no `node:fs`.
 */

const SCOPE = [
  /^apps\/platform\/src\/routes\/_landing[./]/,
  /^apps\/platform\/src\/routes\/_app\.about-us\//,
  /^apps\/platform\/src\/routes\/_app\.product\//,
  /^apps\/platform\/src\/pages\/@sections\//,
  /^apps\/platform\/src\/components\/header\/marketing-header\.tsx$/,
  /^apps\/platform\/src\/components\/chrome\//,
  /^apps\/platform\/src\/components\/footer\//,
];

/** pages under the scope that predate the house rules. each is a redesign,
 *  not a mechanical pass — its whole section language (grey bands, hairline
 *  tables, numbered steps, outlined cards) is the old one, and swapping single
 *  classes would leave it half in each. a page leaves this list when it is
 *  redesigned, never by having its needles allowlisted one at a time. */
const NOT_YET_ON_THE_HOUSE_RULES = [
  "apps/platform/src/routes/_landing.for-international-nonprofits/",
];

/** comments blanked, newlines kept so line numbers still land. */
const uncommented = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^([ \t]*)\/\/.*$/gm, "$1");

const sources = sources_of(import.meta.url, uncommented).filter(
  ({ file }) =>
    SCOPE.some((r) => r.test(file)) &&
    !file.includes(".test.") &&
    !NOT_YET_ON_THE_HOUSE_RULES.some((p) => file.startsWith(p))
);

const line_of = (text: string, i: number) =>
  text.slice(0, i).split("\n").length;

/** every match of `needle` in a file not on `exempt`, as `path:line match`. */
const findings = (needle: RegExp, exempt: string[] = []) =>
  sources
    .filter(({ file }) => !exempt.includes(file))
    .flatMap(({ file, text }) =>
      [...text.matchAll(needle)].map(
        (m) => `${file}:${line_of(text, m.index)} ${m[0]}`
      )
    );

/** every class string in scope, with where it came from. */
const class_values = sources.flatMap(({ file, text }) =>
  [...text.matchAll(/class(?:Name|es)=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
    (m) => ({ file, n: line_of(text, m.index), value: m[1] ?? m[2] ?? "" })
  )
);

/** the class-string tokens as written, minus the quotes a ternary branch
 *  inside a template literal carries. */
const tokens = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/["'`]/g, ""));

/** index just past the `>` that closes the tag opening at `start`, skipping
 *  quotes and nested `{}`/`()` — otherwise an `onClick={() => …}` ends the tag
 *  at its own arrow. */
function tag_end(text: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{" || c === "(") depth++;
    else if (c === "}" || c === ")") depth--;
    else if (c === ">" && depth === 0) return i + 1;
  }
  return -1;
}

describe("one face, one ink", () => {
  test("no <em> inside a heading", () => {
    // the accent word: an italic, a second ink or both, on one word of a
    // heading. the words carry the emphasis. an <em> in body prose — a cited
    // title — is ordinary typography and is not a finding.
    const heading =
      /(?:^|\s|["'`])(?:hero|section|subsection)-heading(?=$|\s|["'`])/;
    const offenders = sources.flatMap(({ file, text }) =>
      [...text.matchAll(/<([A-Za-z][\w.]*)/g)].flatMap((m) => {
        const end = tag_end(text, m.index);
        if (end < 0) return [];
        const attrs = text.slice(m.index, end);
        const cls = /class(?:Name|es)=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(attrs);
        if (!cls || !heading.test(cls[1] ?? cls[2] ?? "")) return [];
        if (attrs.endsWith("/>")) return [];
        const close = text.indexOf(`</${m[1]}>`, end);
        if (close < 0) return [];
        return /<em[\s>]/.test(text.slice(end, close))
          ? [`${file}:${line_of(text, m.index)}`]
          : [];
      })
    );
    expect(offenders).toEqual([]);
  });
});

describe("no eyebrows", () => {
  // the receipt is a printed artefact drawn as one, and a receipt's section
  // labels are its own furniture — the same reason its body is monospace
  const PRINTED = ["apps/platform/src/routes/_landing.pricing/who-pays.tsx"];

  test("no `eyebrow`", () => {
    expect(findings(/(?<![-\w])eyebrow(?![-\w])/g, PRINTED)).toEqual([]);
  });

  test("no `pre-heading` set in capitals", () => {
    // the same kicker spelled out: the lead-in size, uppercased, over the
    // heading. `pre-heading` in sentence case is a readable phrase and passes.
    const offenders = class_values
      .filter(({ value }) => {
        const t = tokens(value);
        return t.includes("pre-heading") && t.includes("uppercase");
      })
      .map(({ file, n }) => `${file}:${n}`);
    expect(offenders).toEqual([]);
  });
});

describe("a flat field", () => {
  test("no gradient", () => {
    // `bg-linear-*`, `bg-radial-*`, `bg-conic-*`, and the css functions behind
    // them in a style object or a bracket value. a repeating gradient is a
    // hatch — a fill pattern encoding a range in a chart — and the anchor's
    // `-` leaves it out without naming it.
    expect(
      findings(
        /(?<![-\w])(?:bg-(?:linear|radial|conic)(?![\w])|(?:linear|radial|conic)-gradient\()/g
      )
    ).toEqual([]);
  });

  test("no dot grid", () => {
    expect(findings(/(?<![-\w])dot-grid/g)).toEqual([]);
  });

  test("no glass", () => {
    // any variant of it: `backdrop-blur-md`, `supports-…:backdrop-blur`.
    expect(findings(/(?<![\w])backdrop-blur/g)).toEqual([]);
  });

  test("no lift at rest", () => {
    // the three marketing lifts stay in the elevation set for what floats; on
    // these pages nothing does — a tile separates by tone.
    expect(findings(/(?<![-\w])shadow-lift-/g)).toEqual([]);
  });
});

describe("the body face", () => {
  test("monospace only in code and printed artefacts", () => {
    const ARTEFACTS = [
      // the terminal: code
      "apps/platform/src/pages/@sections/terminal-card.tsx",
      // the receipt: a printed artefact
      "apps/platform/src/routes/_landing.pricing/who-pays.tsx",
    ];
    expect(findings(/(?<![-\w])font-mono(?![-\w])/g, ARTEFACTS)).toEqual([]);
  });
});

describe("marketing uses the tile family", () => {
  test("no `card` or `card-on-band`", () => {
    // `card` is the product's shell — an edge and --panel. the marketing pages
    // separate by tone: `tile`, `tile-deep`, `tile-inset`.
    const EDGED = [
      // a real form: its fields are drawn against --panel and its errors are
      // measured there, so the shell that holds them keeps the product's
      "apps/platform/src/routes/_landing.for-nonprofits/cta-form.tsx",
      // printable: print drops backgrounds by default, so on paper the edge is
      // the only thing that holds a panel of checkboxes together
      "apps/platform/src/routes/_landing.ethical-fundraising-platform-checklist/checklist.tsx",
      "apps/platform/src/routes/_landing.ethical-fundraising-platform-checklist/route.tsx",
    ];
    const offenders = class_values
      .filter(({ file }) => !EDGED.includes(file))
      .filter(({ value }) =>
        tokens(value).some((t) => t === "card" || t === "card-on-band")
      )
      .map(({ file, n }) => `${file}:${n}`);
    expect(offenders).toEqual([]);
  });
});
