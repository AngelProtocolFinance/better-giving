import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * the names sweep for the button. every other gate in this system works by
 * making an off-system spelling compile to nothing — `--color-*`, `--radius-*`
 * and `--text-*` are reset to `initial`, so `gray-500`, `rounded-lg` and
 * `text-8xl` match no rule. that is exactly why it cannot catch these three:
 * a `btn-xl`, a doubled `btn`, and an icon-only button with no accessible name
 * each produce no error, no warning and no compiled rule — they render, they
 * look plausible in review, and not existing IS the failure mode.
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

const line_of = (text: string, i: number) =>
  text.slice(0, i).split("\n").length;

/** every class string in the corpus, with where it came from. unlike the other
 *  sweeps this one spans lines: a long class string gets wrapped into a
 *  template literal by the formatter, and a wrapped one is precisely where a
 *  doubled `btn` hides from a per-line scan. */
const class_values = sources.flatMap((x) =>
  [...x.text.matchAll(/class(?:es|Name)=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
    (m) => ({
      file: x.file,
      n: line_of(x.text, m.index),
      value: m[1] ?? m[2] ?? "",
    })
  )
);

/** class-string tokens, each stripped of its responsive/state variant prefix
 *  and of the quotes a ternary branch inside a template literal carries. */
const tokens = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => (t.split(":").pop() ?? t).replace(/["'`]/g, ""));

describe("the button size and variant sets", () => {
  /** the closed set, as drawn by components.css and utilities.css. */
  const SET = new Set([
    "btn-sm",
    "btn-md",
    "btn-lg",
    "btn-field",
    "btn-icon",
    "btn-primary",
    "btn-secondary",
    "btn-ghost",
    "btn-destructive",
    "btn-success",
    "btn-warning",
    "btn-form-primary",
    "btn-donate",
  ]);

  test("a button writes no `btn-*` name outside the set", () => {
    // an off-set name compiles to nothing and renders as a bare `.btn` — the
    // md tier in the default variant, which is a plausible-looking button.
    const offenders = class_values.flatMap(({ file, n, value }) => {
      const t = tokens(value);
      if (!t.includes("btn")) return [];
      const bad = t.filter((x) => x.startsWith("btn-") && !SET.has(x));
      return bad.length ? [`${file}:${n} ${bad.join(" ")}`] : [];
    });
    expect(offenders).toEqual([]);
  });

  test("`btn` is spelled once", () => {
    // duplicate class names are inert in css, so this costs nothing at runtime
    // and is invisible in review — which is how five of them accumulated. it
    // is here because it is the tell for a call site copied from another one
    // rather than composed, and those are what the size scale drifts through.
    const offenders = class_values
      .filter(
        ({ value }) => tokens(value).filter((x) => x === "btn").length > 1
      )
      .map(({ file, n }) => `${file}:${n}`);
    expect(offenders).toEqual([]);
  });
});

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

describe("icon-only buttons", () => {
  test("an icon is not an accessible name", () => {
    // a countdown, not a permanent allowlist: the next slice migrates these to
    // the `Button` component, whose `icon` prop is unconstructible without an
    // `aria-label`, and empties this array. a file listed here is exempt whole
    // — the rule cannot tell a newly added unnamed control in it from the one
    // being counted down.
    const exempt = [
      // rich-text toolbar: the insert-link button
      "apps/platform/src/components/rich-text/editor.tsx",
      // deposit panel: the corner close button
      "apps/platform/src/pages/admin/shared/deposit-form/panel.tsx",
      // video modal: the corner close button
      "apps/platform/src/pages/funds/common/videos/video-modal.tsx",
      // videos field: the add-a-video button beside the label
      "apps/platform/src/pages/funds/common/videos/videos.tsx",
      // registration: the mobile tooltip toggle beside a field label
      "apps/platform/src/pages/registration/reference.tsx",
      // fundraiser share dialog: the corner close button
      "apps/platform/src/routes/_app.fundraisers.$fund_id/share.tsx",
      // endowment selector: the remove button on a selected-endowment chip
      "apps/platform/src/routes/_app.fundraisers.new/endowment-selector/endowment-selector.tsx",
      // marketplace filter: the remove button on a selected-country chip
      "apps/platform/src/routes/_app.marketplace.filter/countries.tsx",
      // donation share: the social button itself, and the dialog's close button
      "apps/platform/src/routes/donations.$id/share.tsx",
      // rebalance form: the add-row and remove-row buttons in the tx table
      "apps/platform/src/routes/platform.investments.rebalance/form/index.tsx",
      // multi-combo: the remove button on a selected tag
      "packages/ui/src/components/select/multi-combo.tsx",
    ];
    const offenders = sources.flatMap(({ file, text }) => {
      if (exempt.includes(file)) return [];
      return [...text.matchAll(/<button\b/g)].flatMap((m) => {
        const end = tag_end(text, m.index);
        if (end < 0) return [];
        const attrs = text.slice(m.index, end);
        if (attrs.endsWith("/>")) return [];
        if (/aria-label|aria-labelledby|title=/.test(attrs)) return [];
        const close = text.indexOf("</button>", end);
        if (close < 0) return [];
        const inner = text.slice(end, close).trim();
        // the only child is one self-closing element and nothing else: an
        // icon, and no text node anywhere to name the control.
        if (!/^<[A-Za-z][\w.]*[\s/]/.test(inner)) return [];
        if (tag_end(inner, 0) !== inner.length || !inner.endsWith("/>"))
          return [];
        return [`${file}:${line_of(text, m.index)}`];
      });
    });
    expect(offenders).toEqual([]);
  });
});
