import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * the names sweep for the shells: the scrollbar skin, the table scroller, and
 * the dashboard shell. same reason as the other two sweeps — tailwind v4 is a
 * jit over source text, so a half-spelled skin or a re-hand-rolled shell
 * produces no error, just a surface that quietly stops matching the others.
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

/** every class string in the corpus, with where it came from. */
const class_values = sources.flatMap((x) =>
  x.text
    .split("\n")
    .flatMap((line, i) =>
      [...line.matchAll(/class(?:es|Name)=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
        (m) => ({ file: x.file, n: i + 1, value: m[1] ?? m[2] ?? "" })
      )
    )
);

const tokens = (value: string) => value.split(/\s+/).filter(Boolean);

describe("the scrollbar skin", () => {
  test("the three skin classes are spelled only in their @utility", () => {
    // they were always written as one breath, so a partial spelling is how a
    // scroller ends up thin-but-uncolored, or colored-but-native-width.
    for (const c of [
      "scrollbar-thin",
      "scrollbar-thumb-ring",
      "scrollbar-track-gray-6",
    ]) {
      expect({ [c]: files_with(c) }).toEqual({
        [c]: ["packages/ui/src/styles/utilities.css"],
      });
    }
  });
});

describe("the table scroller", () => {
  test("a horizontal scroller with the skin is spelled `table-scroll`", () => {
    // `table-scroll` IS `overflow-x-auto scrollbars`, so writing both is the
    // hand-spelling the name replaced. the two exemptions below scroll
    // sideways but hold no table, and naming them for one would be a lie in
    // the markup.
    const exempt = [
      // a row of referral cards, scrolled by drag
      "apps/platform/src/components/referrals/hub/index.tsx",
      // a rebalance summary panel: paragraphs and a diff, no table
      "apps/platform/src/routes/platform.investments.rebalance/review/index.tsx",
    ];
    const offenders = class_values
      .filter(({ file, value }) => {
        if (exempt.includes(file)) return false;
        const t = tokens(value);
        if (!t.includes("overflow-x-auto") || !t.includes("scrollbars"))
          return false;
        // a box that scrolls both ways is not the table scroller — a table
        // scrolls sideways and grows downward, never the reverse.
        return !t.some((x) => x.startsWith("overflow-y-"));
      })
      .map(({ file, n }) => `${file}:${n}`);
    expect(offenders).toEqual([]);
  });

  test("nothing re-specifies the scroller's own axis", () => {
    // utilities of equal specificity resolve by stylesheet source order, not
    // by class-string order, so an `overflow-*` beside it silently wins. a
    // `overflow-y-*` is a legitimate second axis and is the caller's.
    const offenders = class_values.flatMap(({ file, n, value }) => {
      const t = tokens(value);
      if (!t.includes("table-scroll")) return [];
      const bad = t
        .map((x) => x.split(":").pop() ?? x)
        .filter((x) => x === "overflow-auto" || x.startsWith("overflow-x-"));
      return bad.length ? [`${file}:${n} ${bad.join(" ")}`] : [];
    });
    expect(offenders).toEqual([]);
  });
});

describe("the popup content shell", () => {
  test("a tooltip or hovercard body is not re-spelled at the call site", () => {
    // `Content` carries `popup_shell`; a class string pairing the fill with the
    // shell's hairline is a call site drawing the body itself, which is how the
    // paddings drifted and the shadow went missing. `outline-gray-6` is the
    // needle because it is the shell's signature — the one edge on the tree
    // that pins its ramp step directly instead of following `--border`.
    const offenders = class_values
      .filter(({ value }) => {
        const t = tokens(value);
        return t.includes("bg-panel") && t.includes("outline-gray-6");
      })
      .map(({ file, n }) => `${file}:${n}`);
    expect(offenders).toEqual([]);
  });

  test("the shell is defined in one place", () => {
    expect(files_with("outline outline-gray-6")).toEqual([
      "packages/ui/src/components/popup.ts",
    ]);
  });
});

describe("the dashboard shell", () => {
  test("the sidebar surfaces do not re-compose their own chrome", () => {
    // donor, npo admin and platform admin used to spell the same four-element
    // shell out each — header, sidebar grid, views, footer — and had already
    // drifted on the footer's margin. the shell owns all four now; a route
    // module reaching for `AppHeader` or `Footer` beside it is that drift
    // starting over.
    const offenders = sources
      .filter((x) => /from "#\/layout\/dashboard"/.test(x.text))
      .filter((x) => /\bLayout\b/.test(x.text))
      .filter((x) => /from "#\/components\/(header|footer)"/.test(x.text))
      .map((x) => x.file);
    expect(offenders).toEqual([]);
  });

  test("the shell is defined in one place", () => {
    expect(files_with("md:grid-cols-[auto_1fr] border-b")).toEqual([
      "apps/platform/src/layout/dashboard/layout.tsx",
    ]);
  });
});
