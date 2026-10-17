import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..");

/** code identifiers and routes that keep the word. user-visible copy does not. */
const ALLOW =
  /\/fundraisers|fundraisers\/|_app\.fundraisers|fundraiser-moderation|\.pdf|professional fundraiser|Charities and\s+Fundraisers|@\/fundraiser|#\/components\/fundraiser|\.\/fundraiser/i;

function files(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "__tests__") continue;
      files(path, out);
      continue;
    }
    if (!/\.tsx?$/.test(name) || name.includes(".test.")) continue;
    if (/sitemap|robots/.test(name)) continue;
    out.push(path);
  }
  return out;
}

function visible(src: string) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const found: string[] = [];
  for (const m of code.matchAll(
    /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g
  )) {
    found.push(m[0].slice(1, -1));
  }
  for (const m of code.matchAll(/>([^<{]+)</g)) {
    const text = m[1].replace(/\s+/g, " ").trim();
    if (text) found.push(text);
  }
  return found;
}

describe("campaign copy", () => {
  it("keeps the word fundraiser out of user-visible copy", () => {
    const hits: string[] = [];
    for (const file of files(SRC)) {
      for (const text of visible(readFileSync(file, "utf8"))) {
        if (!/fundraiser/i.test(text) || ALLOW.test(text)) continue;
        hits.push(`${file.replace(SRC, "src")}: ${text.slice(0, 160)}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
