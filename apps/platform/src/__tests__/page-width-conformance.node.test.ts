import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * the names sweep for the two page-width intents. layout is the one axis with
 * no closed-set gate behind it: `--color-*` and `--radius-*` are reset to
 * `initial` in theme.css so an off-system spelling compiles to nothing, but a
 * hand-picked width compiles fine and only looks slightly wrong. this file is
 * the gate instead.
 *
 * hence the `node` vitest project: the rest of the suite runs in browser mode,
 * which has no `node:fs`.
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

function files_with(needle: string): string[] {
  return sources.filter((x) => x.text.includes(needle)).map((x) => x.file);
}

/** "<file>:<line>" for every line matching `re`. */
function lines_with(re: RegExp): string[] {
  return sources.flatMap((x) =>
    x.text
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter((l) => re.test(l.line))
      .map((l) => `${x.file}:${l.n}`)
  );
}

describe("page width intents", () => {
  test("`xl:container` is gone", () => {
    // the utility it names never capped where it read as if it did: tailwind's
    // `container` carries a nested breakpoint ladder that survives the `xl:`
    // variant, so the 96rem rung still fired — full-bleed below 1280, frozen
    // at 1240px of content to 1535, then 1496px. page-narrow/page-wide replace
    // it everywhere, so the name survives in exactly one file, and in prose.
    const allowed = [
      // names it in prose: the rationale comment on the two intents, which
      // records the curve they replace.
      "packages/ui/src/styles/utilities.css",
    ];
    expect(files_with("xl:container")).toEqual(allowed);
  });

  test("both intents are defined in one place", () => {
    for (const name of ["@utility page-narrow", "@utility page-wide"]) {
      expect(files_with(name)).toEqual([
        "packages/ui/src/styles/utilities.css",
      ]);
    }
  });

  test("nothing re-specifies a container's own width, centering or gutter", () => {
    // utilities of equal specificity resolve by stylesheet source order, not by
    // class-string order, and every one of these sorts AFTER the two intents —
    // so a leftover silently beats the container it sits on. the exception is
    // `prose`, which sorts later still and is meant to: it is the reading
    // measure inside the page width, collapsed onto the same element.
    //
    // `p-4` counts as a gutter: the intents emit `padding-inline`, and the
    // `padding` shorthand overwrites it whichever way the two sort. `py-*`,
    // `pt-*` and `pb-*` do not touch the inline axis and are the caller's.
    const H_PAD = String.raw`\bp[xlrse]?-(?:\d|\[)`;
    const competing = new RegExp(
      String.raw`(page-narrow|page-wide)[^"\`']*\s(mx-auto|container|${H_PAD}|max-w-(?!full)\w)` +
        String.raw`|(mx-auto|container|${H_PAD}|max-w-(?!full)\w)[\w:./[\]-]*\s[^"\`']*(page-narrow|page-wide)`
    );
    expect(lines_with(competing)).toEqual([]);
  });

  test("the old inner-container idiom does not come back", () => {
    // `max-w-6xl mx-auto` inside a full-bleed band was the second page width in
    // the product, at the same 72rem page-narrow now names. `max-w-6xl` on its
    // own is still a legitimate cap on a card that is not a page container.
    expect(lines_with(/max-w-6xl\s+mx-auto|mx-auto\s+max-w-6xl/)).toEqual([]);
  });

  test("a full-bleed band does not stack a gutter on the container inside it", () => {
    // the band paints the fill and holds the vertical rhythm; the container
    // inside it owns the gutter. a `px-*` on the band is a second one, and it
    // wins — the intents sort before every `px-*` in the sheet.
    //
    // two shapes, because a band reaches its container two ways. same-file: an
    // element wrapping the container element directly. cross-file: a section
    // component that spreads the prop onto its root, which is how nearly every
    // marketing band is written here.
    const gutter = /\bp[xlrse]?-(?:\d|\[)/;

    const wrapping = sources.flatMap((x) => {
      const lines = x.text.split("\n");
      return lines
        .map((line, i) => ({ line, next: lines[i + 1] ?? "", n: i + 1 }))
        .filter(
          (l) =>
            /className="[^"]*">\s*$/.test(l.line) &&
            gutter.test(l.line) &&
            /\b(page-narrow|page-wide)\b/.test(l.next)
        )
        .map((l) => `${x.file}:${l.n}`);
    });

    // files whose markup puts a page container under a `classes`/`className`
    // prop. resolved by import, not by component name: `Testimonials` is
    // exported by both a shared section and a route-local one, and only the
    // second is a container.
    const container_files = new Set(
      sources
        .filter((x) => /\b(page-narrow|page-wide)\b/.test(x.text))
        .map((x) => x.file)
    );
    const by_file = new Set(sources.map((x) => x.file));

    /** the module a specifier points at, as a repo-relative path. */
    function resolve_spec(from: string, spec: string): string | null {
      const dir = from.split("/").slice(0, -1);
      let parts: string[];
      if (spec.startsWith("#/"))
        parts = ["apps", "platform", "src", ...spec.slice(2).split("/")];
      else if (spec.startsWith(".")) parts = [...dir, ...spec.split("/")];
      else return null; // a package, never a route-local section
      const out: string[] = [];
      for (const p of parts) {
        if (p === "." || p === "") continue;
        if (p === "..") out.pop();
        else out.push(p);
      }
      const base = out.join("/");
      for (const cand of [
        `${base}.tsx`,
        `${base}.ts`,
        `${base}/index.tsx`,
        `${base}/index.ts`,
      ])
        if (by_file.has(cand)) return cand;
      return null;
    }

    const handed = sources.flatMap((x) => {
      const local = new Map<string, string>();
      for (const m of x.text.matchAll(
        /import\s+\{([^}]*)\}\s+from\s+"([^"]+)"/g
      )) {
        const target = resolve_spec(x.file, m[2]);
        if (!target) continue;
        for (const raw of m[1].split(",")) {
          const name = raw
            .trim()
            .split(/\s+as\s+/)
            .pop()
            ?.trim();
          if (name) local.set(name, target);
        }
      }
      return [...x.text.matchAll(/<(\w+)[\s\n]/g)].flatMap((m) => {
        const target = local.get(m[1]);
        if (!target || !container_files.has(target)) return [];
        // the opening tag only — a prop on a child element is not this band's
        const tag = x.text.slice(m.index).split(">")[0];
        const cls = /class(?:es|Name)="([^"]*)"/.exec(tag);
        if (!cls || !gutter.test(cls[1])) return [];
        const line = x.text.slice(0, m.index).split("\n").length;
        return [`${x.file}:${line} <${m[1]} ${cls[1]}>`];
      });
    });

    // the third shape, and the one the same-file check cannot see: a section
    // component takes the intent through `classes` and then adds a gutter of
    // its own to the very element it spreads that prop onto. the two strings
    // live in different files, so neither reads wrong on its own.
    const recipients = new Set(
      sources.flatMap((x) => {
        const local = new Map<string, string>();
        for (const m of x.text.matchAll(
          /import\s+\{([^}]*)\}\s+from\s+"([^"]+)"/g
        )) {
          const target = resolve_spec(x.file, m[2]);
          if (!target) continue;
          for (const raw of m[1].split(",")) {
            const name = raw
              .trim()
              .split(/\s+as\s+/)
              .pop()
              ?.trim();
            if (name) local.set(name, target);
          }
        }
        return [...x.text.matchAll(/<(\w+)[\s\n]/g)].flatMap((m) => {
          const target = local.get(m[1]);
          if (!target) return [];
          const tag = x.text.slice(m.index).split(">")[0];
          const cls = /class(?:es|Name)="([^"]*)"/.exec(tag);
          if (!cls || !/\b(page-narrow|page-wide)\b/.test(cls[1])) return [];
          return [target];
        });
      })
    );

    const spread = sources
      .filter((x) => recipients.has(x.file))
      .flatMap((x) =>
        [
          ...x.text.matchAll(
            /className=\{`\$\{(?:classes|className)[^}]*\}([^`]*)`\}/g
          ),
        ]
          .filter((m) => gutter.test(m[1]))
          .map(
            (m) =>
              `${x.file}:${x.text.slice(0, m.index).split("\n").length}${m[1]}`
          )
      );

    expect([...wrapping, ...handed, ...spread]).toEqual([]);
  });
});
