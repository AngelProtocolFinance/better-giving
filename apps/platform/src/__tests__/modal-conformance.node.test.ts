import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { modal_box } from "@better-giving/ui/helpers";
import { describe, expect, test } from "vitest";

/**
 * the names sweep for the modal size set. tailwind v4 is a jit over source
 * text, so an off-system spelling produces no rule and no error — the failure
 * mode is a class that simply does not exist, and only a filesystem sweep
 * catches it.
 *
 * hence the `node` vitest project: the rest of the suite runs in browser mode,
 * which has no `node:fs`.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = resolve(here, "..", "..", "..", "..");
const self = relative(repo, fileURLToPath(import.meta.url));

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

const sources = ROOTS.flatMap((r) => walk(join(repo, r)));

/** every scanned file whose text contains `needle`, repo-relative, sorted.
 *  this file is skipped: it spells the needles out itself. */
function files_with(needle: string): string[] {
  return sources
    .map((f) => ({ f, text: readFileSync(f, "utf8") }))
    .filter((x) => x.text.includes(needle))
    .map((x) => relative(repo, x.f).split(sep).join("/"))
    .filter((f) => f !== self.split(sep).join("/"))
    .sort();
}

describe("modal size set", () => {
  test("`fixed-center` is spelled only where it is defined and spent", () => {
    const owners = [
      // spends it — one full literal string per tier
      "packages/ui/src/helpers/modal-box.ts",
      // defines it
      "packages/ui/src/styles/utilities.css",
    ];
    // the one centered box that is not a modal *content* box: an
    // aspect-ratio-driven media viewport whose height is already bounded by
    // its own 80vh crop surface. it has no width cap to collapse onto, and any
    // tier's `sm:max-w-*` would clip or letterbox the crop area.
    const exempt = ["apps/platform/src/components/img-editor/img-cropper.tsx"];

    expect(files_with("fixed-center")).toEqual([...exempt, ...owners].sort());
  });

  test("the modal action-bar row is spelled only in its @utility", () => {
    const bar =
      "p-3 sm:px-8 sm:py-4 flex items-center justify-end gap-4 w-full text-center sm:text-right bg-muted border-t";
    expect(files_with(bar)).toEqual(["packages/ui/src/styles/utilities.css"]);
  });

  test("every tier bounds its own height", () => {
    const unbounded = Object.entries(modal_box)
      .filter(([, cls]) => !cls.includes("max-h-[90dvh]"))
      .map(([tier]) => tier);
    expect(unbounded).toEqual([]);
  });

  test("the geometry escape hatch stays at one call site", () => {
    expect(files_with('size="none"')).toEqual([
      // an edge-anchored drawer, not a centered content box
      "apps/platform/src/layout/dashboard/sidebar/sidebar-opener/toggleable-sidebar.tsx",
    ]);
  });

  test("no tier carries a surface — geometry only", () => {
    // a surface baked into the base would beat or lose to the call site's own
    // by stylesheet source order, not by class-string order.
    const surfaced = Object.entries(modal_box)
      .filter(([, cls]) => /(^|\s)(bg-|text-|border(\s|$))/.test(cls))
      .map(([tier]) => tier);
    expect(surfaced).toEqual([]);
  });
});
