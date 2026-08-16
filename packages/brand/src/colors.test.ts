import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colors } from "./colors.ts";
import { oklch_to_hex } from "./oklch.ts";

// drift guard: colors.ts must always agree with the light half of colors.css.
// parses :root the same way a human eye would — literal oklch() tokens only,
// var()/color-mix() aliases and --radius fall out on their own since their
// values don't match the oklch(...) pattern.
const css = readFileSync(new URL("./colors.css", import.meta.url), "utf8");

function sole_block(selector: string): string {
  const matches = [
    ...css.matchAll(new RegExp(`${selector}\\s*{([^}]*)}`, "gs")),
  ];
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one ${selector} block, found ${matches.length}`
    );
  }
  return matches[0][1];
}

const root_block = sole_block(":root");
const dark_block = sole_block("\\.dark");

const css_tokens = new Map<string, string>();
for (const m of root_block.matchAll(/--([a-z0-9-]+):\s*oklch\(([^)]+)\)/gi)) {
  const key = m[1].replace(/-/g, "_");
  const parts = m[2].trim().split(/\s+/);
  const nums = parts.map(Number);
  // alpha (`/ 50%`) or `none` must not silently parse as opaque — the email
  // mirror has no alpha channel, so anything but a plain 3-channel token
  // needs a human decision, not a wrong hex.
  if (parts.length !== 3 || nums.some((n) => Number.isNaN(n))) {
    throw new Error(
      `--${m[1]}: oklch(${parts.join(" ")}) isn't a plain 3-channel token`
    );
  }
  const [L, C, h] = nums;
  css_tokens.set(key, oklch_to_hex(L, C, h));
}

describe("colors.ts matches colors.css", () => {
  it("has the same token set", () => {
    expect(Object.keys(colors).sort()).toEqual([...css_tokens.keys()].sort());
  });

  it.each([
    ...css_tokens.entries(),
  ])("%s converts to the value in colors.ts", (key, hex) => {
    expect(colors[key as keyof typeof colors]).toBe(hex);
  });
});

describe(".dark stays in lockstep with :root", () => {
  // --radius is the one :root token .dark intentionally doesn't redefine —
  // corner radius is theme-invariant, not a color, so dark falls back to it.
  const root_only = new Set(["radius"]);

  it("redefines every :root token", () => {
    const root_keys = [...root_block.matchAll(/--([a-z0-9-]+):/g)]
      .map((m) => m[1])
      .filter((k) => !root_only.has(k));
    const dark_keys = [...dark_block.matchAll(/--([a-z0-9-]+):/g)].map(
      (m) => m[1]
    );
    expect([...new Set(dark_keys)].sort()).toEqual(
      [...new Set(root_keys)].sort()
    );
  });
});
