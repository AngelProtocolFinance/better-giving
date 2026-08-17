// regenerates colors.ts from colors.css's :root oklch() tokens.
// run: pnpm --filter @better-giving/brand generate-colors
import { readFileSync, writeFileSync } from "node:fs";

import { oklch_to_hex } from "../oklch.ts";

const css_path = new URL("../colors.css", import.meta.url);
const out_path = new URL("../colors.ts", import.meta.url);

const css = readFileSync(css_path, "utf8");
const root_matches = [...css.matchAll(/:root\s*{([^}]*)}/gs)];
if (root_matches.length !== 1) {
  throw new Error(
    `expected exactly one :root block, found ${root_matches.length}`
  );
}
const root_block = root_matches[0][1];

const entries: [string, string][] = [];
for (const m of root_block.matchAll(/--([a-z0-9-]+):\s*oklch\(([^)]+)\)/gi)) {
  const key = m[1].replace(/-/g, "_");
  const parts = m[2].trim().split(/\s+/);
  const [L, C, h] = parts.map(Number);
  if (parts.length !== 3 || [L, C, h].some((n) => Number.isNaN(n))) {
    throw new Error(
      `--${m[1]}: oklch(${parts.join(" ")}) isn't a plain 3-channel token`
    );
  }
  entries.push([key, oklch_to_hex(L, C, h)]);
}

const body = entries.map(([key, hex]) => `  ${key}: "${hex}",`).join("\n");

const out = `// GENERATED — do not hand-edit; run \`pnpm --filter @better-giving/brand generate-colors\`.
// hex twin of colors.css's light (:root) palette, for consumers that can't read
// oklch() or CSS custom properties — currently the transactional email templates.
// no dark mode, no var()/color-mix() aliases: just the literal oklch() tokens,
// converted. keys are the css token name with hyphens as underscores.
// colors.test.ts asserts this never drifts from colors.css — keep them in lockstep.
export const colors = {
${body}
};
`;

writeFileSync(out_path, out);
