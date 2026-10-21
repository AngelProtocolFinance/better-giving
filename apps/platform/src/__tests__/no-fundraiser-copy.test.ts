import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..");

/**
 * code identifiers and routes that keep the word, including the settings tab value. user-visible copy does not.
 * each alternative consumes its whole token and is removed per occurrence, so a sentence that merely
 * contains an allowed path still fails on its other uses of the word.
 */
const ALLOW =
  /\S*\/fundraisers\S*|\S*fundraisers\/\S*|\S*_app\.fundraisers\S*|\S*fundraiser-moderation\S*|\S*\.pdf\b|professional fundraiser|Charities and\s+Fundraisers|@\/fundraiser\S*|#\/components\/fundraiser\S*|\.\/fundraiser\S*/gi;

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

function visible(src: string, jsx = true) {
  // strings are matched first and kept, so a `//` inside one isn't a comment
  const code = src.replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|(?<!:)\/\/.*$/gm,
    (_, str: string | undefined) => str ?? ""
  );
  const found: string[] = [];
  for (const m of code.matchAll(
    /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g
  )) {
    found.push(m[0].slice(1, -1));
  }
  if (!jsx) return found; // .ts has no JSX; generics would read as tags
  // JSX text between > and <, with up to two levels of {expression} inside; text is split at each expression
  for (const m of code.matchAll(
    /(?<!=)>((?:[^<>{}]|\{(?:[^{}]|\{[^{}]*\})*\})+)</g
  )) {
    for (const seg of m[1].split(/\{(?:[^{}]|\{[^{}]*\})*\}/)) {
      const text = seg.replace(/\s+/g, " ").trim();
      if (text) found.push(text);
    }
  }
  return found;
}

function isAllowed(text: string) {
  return (
    text === "fundraisers" || !/fundraiser/i.test(text.replace(ALLOW, " "))
  );
}

/** the strings of `src` that carry the word without an allowed use of it. */
function flagged(src: string, jsx = true) {
  return visible(src, jsx).filter(
    (t) => /fundraiser/i.test(t) && !isAllowed(t)
  );
}

describe("guard self-test", () => {
  it("catches JSX text adjacent to an expression", () => {
    const src = `<p>An email goes to {creator_name}. Stop receiving from this fundraiser.</p>`;
    expect(flagged(src)).toHaveLength(1);
  });

  it("catches the word beside an allowed route path in one string", () => {
    expect(
      flagged(`const a = "Visit /fundraisers to start a fundraiser";`)
    ).toHaveLength(1);
  });

  it("catches copy on a line after an https:// literal", () => {
    const src = `const u = "https://x.io"; const t = "Start a fundraiser";`;
    expect(flagged(src)).toHaveLength(1);
  });

  it("catches copy on a line after a protocol-relative string", () => {
    const src = `const u = "//cdn.example"; const t = "Start a fundraiser";`;
    expect(flagged(src)).toHaveLength(1);
  });

  it("passes routes, pdf names, legal phrases and clean interpolated copy", () => {
    const src = [
      `const a = "/fundraisers";`,
      `const b = "terms/fundraiser-guide.pdf";`,
      `const c = "a professional fundraiser";`,
      `<p>Hello {name}, welcome to your campaign.</p>`,
    ].join("\n");
    expect(flagged(src)).toEqual([]);
  });
});

describe("campaign copy", () => {
  it("keeps the word fundraiser out of user-visible copy", () => {
    const hits: string[] = [];
    for (const file of files(SRC)) {
      for (const text of flagged(
        readFileSync(file, "utf8"),
        file.endsWith("x")
      )) {
        hits.push(`${file.replace(SRC, "src")}: ${text.slice(0, 160)}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
