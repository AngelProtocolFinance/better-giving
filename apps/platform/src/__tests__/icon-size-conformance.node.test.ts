import { describe, expect, test } from "vitest";
import { sources_of } from "./conformance/walk";

/**
 * the icon-size sweep. the six steps are `icon-xs|sm|md|lg|xl|2xl`, bound by
 * `@utility` in packages/ui/src/styles/utilities.css and tabled in
 * packages/brand/design-system.md; `size={n}` is the spelling they replaced.
 * both spell the same box, so a site that goes back to the prop renders
 * correctly, reviews correctly, and is off the ladder — nothing but this sweep
 * separates the two.
 *
 * the corpus is apps/platform/src + packages/ui/src. apps/docs/src is on the
 * same stylesheet and spends the same steps, but `sources_of` does not reach
 * it and widening it is its own slice — until then a ladder value written
 * there fails nothing.
 *
 * hence the `node` vitest project: the rest of the suite runs in browser mode,
 * which has no `node:fs`.
 */

/** comments blanked, newlines kept so line numbers still land. an apostrophe
 *  in a `//` line otherwise opens a string the attribute scan never closes. */
const uncommented = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^([ \t]*)\/\/.*$/gm, "$1");

const sources = sources_of(import.meta.url, uncommented);

const LADDER: Record<number, string> = {
  12: "icon-xs",
  14: "icon-sm",
  16: "icon-md",
  18: "icon-lg",
  20: "icon-xl",
  24: "icon-2xl",
};

const STEPS = new Set(Object.values(LADDER));

interface Sized {
  name: string;
  n: number;
  size: number;
}

/** every component tag carrying a literal numeric `size` prop OF ITS OWN. a
 *  nested `<Icon size={20} />` inside a render-prop belongs to that element,
 *  so a brace group holding a tag is skipped rather than searched — otherwise
 *  a `<Combo adornment={…}>` answers for the glyph its callback returns. */
function sized_tags(text: string): Sized[] {
  const out: Sized[] = [];
  // capitalized, or a member expression: `<DrawerIcon`, `<card.icon`. a
  // lucide glyph reached through data is still a call site.
  const re = /<([A-Z][\w.]*|[a-z]\w*\.[\w.]+)(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: the exec loop idiom
  while ((m = re.exec(text)) !== null) {
    let depth = 0;
    let quote: string | null = null;
    let own = "";
    let brace = "";
    let i = m.index + m[0].length;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (depth) brace += c;
        else own += c;
        if (c === quote && text[i - 1] !== "\\") quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        quote = c;
        if (depth) brace += c;
        else own += c;
        continue;
      }
      if (c === "{") {
        depth++;
        brace += c;
        continue;
      }
      if (c === "}") {
        depth--;
        brace += c;
        if (depth === 0) {
          own += /<[A-Za-z]/.test(brace) ? "{}" : brace;
          brace = "";
        }
        continue;
      }
      if (depth) {
        brace += c;
        continue;
      }
      if (c === ">") break;
      own += c;
    }
    const size = own.match(/(?:^|\s)size=\{\s*(\d+)\s*\}/);
    if (size)
      out.push({
        name: m[1],
        n: text.slice(0, m.index).split("\n").length,
        size: Number(size[1]),
      });
  }
  return out;
}

/** a numeric `size` here is not an icon box, so neither assertion applies. */
const not_a_glyph: Record<string, string[]> = {
  // the social row's marks are raster/svg assets in an <img>, and the number
  // is its `width`. they sit off the ladder on purpose, at seven sizes tuned
  // to each mark's own optical weight.
  "apps/platform/src/routes/_app.marketplace_.$id._index/details-column/socials.tsx":
    ["SocialsIcon"],
};

/** components declaring a numeric `size` of their own and forwarding it to a
 *  lucide glyph. `Copier` takes one number or a `{ copy, check }` pair for the
 *  two glyphs it swaps between, so a caller here is setting a prop, not
 *  writing a box. */
const forwards_size = ["Copier"];

/** the one glyph the ladder cannot claim. packages/brand/design-system.md used
 *  to record four, but a computed className was never the obstacle it read as
 *  — a template literal reaches one — so the three in `donations.$id/route.tsx`
 *  moved and only this is left: its box is `h-lh`, which a step would override,
 *  and matching the line it sits on is the whole point of the site. */
const unreachable: Record<string, string[]> = {
  "apps/platform/src/components/donation/common/method-benefits.tsx": [
    "LightbulbIcon",
  ],
};

/** every `class`/`className`/`classes` value in a file, plus every `@apply`,
 *  with the line each sits on. a step reaches the DOM through one of those and
 *  never through a table, and reading only them keeps prose out of the search:
 *  `icon-only` is a word in a `describe` title, not a class anyone wrote. */
function class_values(text: string): { n: number; body: string }[] {
  const out: { n: number; body: string }[] = [];
  const re = /\bclass(?:Name|es)?\s*=|@apply\b/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: the exec loop idiom
  while ((m = re.exec(text)) !== null) {
    let i = m.index + m[0].length;
    const n = text.slice(0, m.index).split("\n").length;
    if (m[0] === "@apply") {
      const end = text.indexOf(";", i);
      out.push({ n, body: text.slice(i, end < 0 ? undefined : end) });
      continue;
    }
    const open = text[i];
    if (open === '"' || open === "'") {
      const end = text.indexOf(open, i + 1);
      out.push({ n, body: text.slice(i + 1, end < 0 ? undefined : end) });
      continue;
    }
    if (open !== "{") continue;
    // brace-balanced, so a `classes={{ container: "icon-md" }}` and a template
    // literal holding a ternary both come back whole.
    let depth = 0;
    for (; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) break;
    }
    out.push({ n, body: text.slice(m.index + m[0].length, i + 1) });
  }
  return out;
}

const allowed = (file: string, name: string) =>
  forwards_size.includes(name) || (unreachable[file] ?? []).includes(name);

const glyphs = sources.flatMap(({ file, text }) =>
  sized_tags(text)
    .filter((t) => !(not_a_glyph[file] ?? []).includes(t.name))
    .map((t) => ({ file, ...t }))
);

describe("an icon box is spent by name", () => {
  test("no glyph writes a ladder value as a numeric size prop", () => {
    // the six steps and the six numbers are the same boxes in two
    // syntaxes, so this is the only thing that keeps the prop from coming
    // back one site at a time.
    const offenders = glyphs
      .filter((g) => g.size in LADDER && !allowed(g.file, g.name))
      .map(
        (g) =>
          `${g.file}:${g.n} <${g.name} size={${g.size}}> → ${LADDER[g.size]}`
      );
    expect(offenders).toEqual([]);
  });

  test("the off-ladder sizes are the ones already here", () => {
    // values, never counts: a count moves with ordinary feature work and
    // would make this a chore, while a value the set does not hold means a
    // seventh size was invented. a new entry is a design call, not a test to
    // update — snapping these to the ladder is a visual change and the user's
    // to make, so take it there before touching this list.
    const seen = [...new Set(glyphs.map((g) => g.size))]
      .filter((s) => !(s in LADDER))
      .sort((a, b) => a - b);
    expect(seen).toEqual([
      11, 13, 15, 17, 19, 21, 22, 26, 28, 30, 35, 40, 48, 70, 80, 92,
    ]);
  });

  test("no class spends an icon name off the ladder", () => {
    // a name outside the six draws nothing: tailwind emits no rule for it,
    // so it paints nothing, errors nowhere and reads correctly in review.
    // that is a retired step and a typo both, and renumbering the ladder is
    // when they arrive — nothing else here would see one.
    const offenders = sources.flatMap(({ file, text }) =>
      class_values(text).flatMap(({ n, body }) =>
        [...body.matchAll(/(?<![-\w])icon-[\w-]+/g)]
          .filter((m) => !STEPS.has(m[0]))
          .map((m) => `${file}:${n} ${m[0]}`)
      )
    );
    expect(offenders).toEqual([]);
  });
});
