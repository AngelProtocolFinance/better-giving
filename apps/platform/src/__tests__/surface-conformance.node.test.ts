import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * the sweep for a brand fill that never declared its ink.
 *
 * `bg-primary` is a color utility and can only set one property. an element
 * that carries it and nothing else paints the brand fill and then lets
 * everything inside inherit the *page's* foreground — dark ink on a dark
 * brand ground — while `--ring` and `--border` keep the values they were
 * given against the page, where `--ring` IS `--primary` and so paints an
 * invisible focus outline on the very control the band exists to hold.
 * `surface-primary` (utilities.css) is the name that sets all four.
 *
 * no other gate reaches this. the closed-set gates work by making an
 * off-system spelling compile to nothing — `--color-*`, `--radius-*` and
 * `--text-*` are reset to `initial`, so `gray-500` and `rounded-lg` match no
 * rule. here the class is real, it compiles, it paints, and the defect is the
 * *second* declaration that was never written. nothing errors, nothing warns,
 * and the band looks plausible in review until someone tabs to the button.
 *
 * hence the `node` vitest project: the rest of the suite runs in browser mode,
 * which has no `node:fs`.
 *
 * ## the rule is narrow on purpose, and carries no exemption list
 *
 * one full-strength, unprefixed `bg-primary` on an element with content and no
 * ink of its own. every narrowing below exists so that a shape which is
 * *correct on its own merits* is dropped by the predicate rather than by a
 * name on a list — a list is where a real defect eventually hides, because
 * nobody re-derives why an entry is on it.
 *
 * - **alpha steps are out.** `bg-primary/10` and `bg-primary/50` are tints,
 *   not the brand ground, and their contrast story is a different one. the
 *   icon chips that carry them pair with `text-primary`, which is a declared,
 *   deliberate ink on a 10% tint.
 * - **variant-prefixed fills are out.** `data-[state=checked]:bg-primary` on a
 *   toggle track or a radio control is a third story again: the fill only
 *   exists in one state, and what sits on it is a `bg-card` dot or a
 *   `Switch.Thumb` that takes no `currentColor` at all. those controls draw
 *   their focus ring with `outline-offset-2`, so it lands on the page ground
 *   rather than on the fill, and the ring collapse this file is about cannot
 *   reach them.
 * - **any `text-*` token satisfies the ink half**, not `text-primary-fg`
 *   specifically. the question is whether the element declared an ink, not
 *   which one.
 *
 * ## what it deliberately does not cover
 *
 * extend it knowingly rather than assuming coverage it never had.
 *
 * - **`text-*` is tailwind's shared prefix** for size, alignment and wrapping
 *   as well as color, so a band spelling `bg-primary text-center` satisfies
 *   the ink half without declaring an ink. enumerating the color half of that
 *   namespace would be an exemption list wearing a different hat, so it is
 *   left open.
 * - **an off-token ink still counts as an ink.** a band spelling
 *   `bg-primary text-white` passes here — `text-white` is the literal value of
 *   `--primary-fg` written as a raw color. that is a real finding, but it is
 *   the *raw-color* sweep's finding, not this one's.
 * - **it reads one file at a time.** two shapes escape, the same blind spot
 *   `modal-conformance` documents: a class string handed to a component
 *   (`<Section classes="bg-primary py-24" />`) lands on that component's own
 *   root in another file, and the tag here is self-closing; and a class bundle
 *   hoisted into a `const` and spent as `className={bundle}` has no tag beside
 *   it at all.
 *
 *   the first shape is the one that hides a whole band: the class string and
 *   the element it lands on sit in different files, so neither file on its own
 *   shows a brand ground with no ink. only reading both together does.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = resolve(here, "..", "..", "..", "..");
const self = relative(repo, fileURLToPath(import.meta.url))
  .split(sep)
  .join("/");

const ROOTS = ["apps/platform/src", "packages/ui/src"];
const EXTS = [".ts", ".tsx", ".css"];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (EXTS.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

/** repo-relative path + text of every scanned file. this file is skipped: it
 *  spells the needles out itself. */
const sources = ROOTS.flatMap((r) => walk(join(repo, r)))
  .map((f) => ({
    file: relative(repo, f).split(sep).join("/"),
    text: readFileSync(f, "utf8"),
  }))
  .filter((x) => x.file !== self)
  .sort((a, b) => a.file.localeCompare(b.file));

const line_of = (text: string, i: number) =>
  text.slice(0, i).split("\n").length;

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

/** the class-string tokens exactly as written, variant prefixes intact, minus
 *  the quotes a ternary branch inside a template literal carries. */
const raw_tokens = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/["'`]/g, ""));

describe("a --primary fill declares its own ink", () => {
  test("`bg-primary` on an element with content also names an ink", () => {
    // the carve-out is the predicate itself, not a list. a small fill that
    // holds text — a status pill, a selected tab, a filter chip — names its
    // ink on the same node and passes. a dot, a slider range or a skeleton
    // block holds nothing and is self-closing or empty, so it passes too. a
    // tint and a state-variant fill are dropped by the narrowings above. what
    // is left is a full-strength brand ground with content inside it and no
    // ink of its own, which is a band: it wants `surface-primary`, which sets
    // the fill, the foreground, and rebinds --ring and --border for
    // everything inside.
    const offenders = sources.flatMap(({ file, text }) =>
      [...text.matchAll(/<([A-Za-z][\w.]*)/g)].flatMap((m) => {
        const end = tag_end(text, m.index);
        if (end < 0) return [];
        const attrs = text.slice(m.index, end);
        const cls = /class(?:Name|es)=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(attrs);
        if (!cls) return [];
        const value = cls[1] ?? cls[2] ?? "";
        const t = raw_tokens(value);
        if (!t.includes("bg-primary")) return [];
        if (t.some((x) => x.startsWith("text-"))) return [];
        // content inside it. a self-closing tag has none, and neither does an
        // element whose span is empty.
        if (attrs.endsWith("/>")) return [];
        const close = text.indexOf(`</${m[1]}>`, end);
        if (close < 0) return [];
        if (text.slice(end, close).trim() === "") return [];
        return [`${file}:${line_of(text, m.index)}`];
      })
    );
    expect(offenders).toEqual([]);
  });
});
