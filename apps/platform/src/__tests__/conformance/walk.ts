import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** the shared corpus the `*-conformance.node.test.ts` sweeps read. these run in
 *  the `node` vitest project: the rest of the suite is browser mode, which has
 *  no `node:fs`. */

const repo = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  ".."
);

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

export interface Source {
  /** repo-relative, "/"-separated */
  file: string;
  text: string;
}

/** repo-relative path + text of every scanned file, sorted. the calling sweep
 *  is skipped — it spells its own needles out — so pass its `import.meta.url`.
 *  `transform` is how a sweep that reads raw text rather than `className=`
 *  attributes blanks comments before the search runs. */
export function sources_of(
  meta_url: string,
  transform: (text: string) => string = (t) => t
): Source[] {
  const self = relative(repo, fileURLToPath(meta_url)).split(sep).join("/");
  return ROOTS.flatMap((r) => walk(join(repo, r)))
    .map((f) => ({
      file: relative(repo, f).split(sep).join("/"),
      text: transform(readFileSync(f, "utf8")),
    }))
    .filter((x) => x.file !== self)
    .sort((a, b) => a.file.localeCompare(b.file));
}
