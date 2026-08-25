// verifies every name conventions.md promises against the freshly built bundle.
// the header is inlined verbatim into the design agent's system prompt and a
// name with no rule fails silently, so this is the only thing standing between
// a prose edit and a design that renders unstyled.
//
//   cd apps/design-sync && node .design-sync/check-conventions.mjs
//
// exits non-zero when a promised name has no rule. run it after every build
// whose stylesheet or header moved, before uploading.
import fs from "node:fs";

const OUT = process.argv[2] ?? "ds-bundle";
const css = fs.readFileSync(`${OUT}/_ds_bundle.css`, "utf8");
const styles = fs.readFileSync(`${OUT}/styles.css`, "utf8");
const bundle = fs.readFileSync(`${OUT}/_ds_bundle.js`, "utf8");
const md = fs.readFileSync(".design-sync/conventions.md", "utf8");
const comps = fs
  .readdirSync(`${OUT}/components`)
  .flatMap((g) => fs.readdirSync(`${OUT}/components/${g}`));

// tailwind escapes . / [ ] : % @ ( ) in the emitted selector, so `p-1.5`
// lands as `.p-1\\.5` — the pattern has to match the backslash too.
const has = (n) => {
  const body = n.replace(/[./[\]:%@()]/g, (c) => `\\\\\\${c}`);
  return new RegExp(`\\.${body}(?![a-zA-Z0-9_-])`).test(css);
};

// the enumerated promises. each entry is a claim the header makes in prose;
// when a claim changes, change it here in the same edit.
// a fill whose ink follows it, so the pair is authored and claimable. every
// other fill takes the neutral rung — there is no --panel-fg or --band-fg to
// claim, because ink on a light surface is always gray-12.
const INKED = ["primary", "success", "warning", "destructive"];
// fills that carry the neutral ink rung instead of an -fg of their own.
const PLAIN = [
  "background",
  "panel",
  "surface",
  "overlay",
  "band",
  "secondary",
  "secondary-active",
  "sidebar",
];
const BOX = [
  0,
  "px",
  0.5,
  1,
  1.5,
  2,
  2.5,
  3,
  3.5,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  14,
  16,
  20,
  24,
  28,
  32,
  36,
  40,
  44,
  48,
  52,
  56,
  60,
  64,
  72,
  80,
  96,
];
const SPACE = BOX.slice(0, BOX.indexOf(24) + 1);
const claims = {
  "surface fills": [
    ...INKED.map((s) => `bg-${s}`),
    ...PLAIN.map((s) => `bg-${s}`),
  ],
  "surface ink": [
    ...INKED.map((s) => `text-${s}-fg`),
    "text-gray-12",
    "text-gray-11",
  ],
  "authored subtle pairs": ["destructive", "success", "warning"].flatMap(
    (s) => [`bg-${s}-subtle`, `text-${s}-subtle-fg`]
  ),
  lines: ["border-gray-6", "ring-ring", "outline-ring"],
  "chart ramp": ["bg", "text", "border", "fill", "stroke"].flatMap((p) =>
    [1, 2, 3, 4, 5].map((n) => `${p}-chart-${n}`)
  ),
  "box ladder": ["w", "h", "size", "min-w", "min-h", "max-w"].flatMap((p) =>
    BOX.map((s) => `${p}-${s}`)
  ),
  "space ladder": [
    "gap",
    "gap-x",
    "gap-y",
    "p",
    "px",
    "py",
    "pt",
    "pr",
    "pb",
    "pl",
    "m",
    "mx",
    "my",
    "mt",
    "mr",
    "mb",
    "ml",
  ].flatMap((p) => SPACE.map((s) => `${p}-${s}`)),
  radius: ["rounded", "rounded-full", "rounded-none"],
  buttons: [
    "btn",
    "btn-primary",
    "btn-secondary",
    "btn-ghost",
    "btn-outline",
    "btn-destructive",
    "btn-success",
    "btn-warning",
    "btn-form-primary",
    "btn-sm",
    "btn-lg",
    "btn-field",
    "btn-icon",
    "pending",
  ],
  "action row": ["actions", "actions-split", "actions-band"],
  "hand-composed controls": [
    "field-input",
    "field-input-container",
    "field-err",
    "label",
    "label-floating",
    "selector-btn",
    "selector-opt",
    "table",
  ],
  utilities: [
    "surface-primary",
    "eyebrow",
    "section-heading",
    "section-body",
    "hero-heading",
    "article-heading",
    "flex-center",
    "absolute-center",
    "overlay",
  ],
  "page + scrollers": ["page", "table-scroll", "scrollbars"],
  measure: ["max-w-3xl", "max-w-prose"],
  type: ["text-sm", "text-xs", "text-2xs"],
};

// names the header deliberately says do NOT exist. present here = the prose
// is now wrong in the other direction.
const MUST_BE_ABSENT = [
  "modal-actions",
  "rounded-sm",
  "rounded-md",
  "rounded-lg",
  "rounded-xl",
  "rounded-xs",
  "btn-link",
  "bg-gray-500",
  "text-red-600",
  "border-slate-200",
  "border-primary-border",
  "ring-primary-ring",
  "text-background-fg",
];

let bad = 0;
for (const [label, names] of Object.entries(claims)) {
  const miss = names.filter((n) => !has(n));
  if (miss.length) {
    bad += miss.length;
    console.log(`✗ ${label}: ${miss.join(", ")}`);
  } else console.log(`✓ ${label} (${names.length})`);
}
const present = MUST_BE_ABSENT.filter(has);
if (present.length) {
  bad += present.length;
  console.log(`✗ documented as absent but compiles: ${present.join(", ")}`);
} else
  console.log(
    `✓ documented-absent names (${MUST_BE_ABSENT.length}) all absent`
  );

// components and css variables named anywhere in the header
for (const m of md.matchAll(/`(--[a-z0-9-]+)`/g))
  if (!css.includes(m[1]) && !styles.includes(m[1])) {
    bad++;
    console.log(`✗ token ${m[1]} defined nowhere`);
  }
// component names the header points a design at: backticked identifiers and
// jsx tags only — prose capitalisation is not a claim about the bundle.
const named = new Set([
  ...[...md.matchAll(/`([A-Z][A-Za-z]*)`/g)].map((m) => m[1]),
  ...[...md.matchAll(/<([A-Z][A-Za-z]*)/g)].map((m) => m[1]),
]);
for (const n of named) {
  if (comps.includes(n) || bundle.includes(n)) continue;
  bad++;
  console.log(
    `✗ "${n}" is neither a component folder nor an export in the bundle`
  );
}

console.log(
  bad ? `\n${bad} problem(s)` : "\nconventions.md verifies against this build"
);
process.exit(bad ? 1 : 0);
