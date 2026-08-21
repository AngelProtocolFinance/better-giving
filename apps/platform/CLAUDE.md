# Better Giving Web App

The web app — a workspace member (`better-giving`) of the Better Giving monorepo. Repo-wide layout, commands, tooling, deploy, and package-management rules live in the root `CLAUDE.md`; this file covers app-internal conventions. Paths here are relative to `apps/platform/`.

## Path Aliases

Resolved via `tsconfig.json` (+ vite `resolve.tsconfigPaths`):

- `#/` → `src/`
- `@/` → `lib/`
- `$/` → `.server/`
- inside `lib/` and `.server/`, use relative paths (`../foo`) for siblings — `@/` and `$/` are for cross-layer imports only. `lib/` stays portable; `.server/` stays coherent.
- inside `src/`, use `#/` freely — routes are deeply nested (filesystem-routed) and `../../../components/foo` is worse than `#/components/foo`. Reserve relative paths for tight co-located groups (a route folder importing its own `./api`, `./schema`).

## Architecture

Three-layer structure:

- **`src/`** — React Router routes, components, client code
- **`lib/`** — shared business logic, types, schemas (isomorphic)
- **`.server/`** — server-only code, pg schema, migrations, auth, queues
- also: `jobs/` (one-off jobs), `scripts/` (dev/tooling), `plugins/`, `utils/`, `public/`

## Stack

- **Framework**: React Router v7 (SSR, framework mode)
- **DB**: PostgreSQL via drizzle-orm (neon everywhere — dev/staging share one branch, prod is its own); DynamoDB + dynamodb-toolbox v2 (legacy, migrating)
- **Validation**: valibot
- **Forms**: react-hook-form + remix-hook-form
- **UI**: Tailwind v4, Ark UI, Lucide icons, Motion
- **Testing**: Vitest browser mode (playwright/chromium) + vitest-browser-react + MSW

## Testing

- setup files: `src/setup-tests-browser.ts`, `src/__tests__/mocks/payment.tsx`
- config in `vite.config.ts` under `test`
- environment: vitest browser mode, headless chromium via playwright; globals enabled
- `.claude/**` is in vitest's `exclude` (defensive — Claude config lives in the root `.claude/`, not here)
- when running vitest on changed files, use `--bail 1 --changed` to fail fast and scope to changes only

## Code Style

- casing: `snake_case` (vars/fns), `PascalCase` (classes/components), `SCREAMING_SNAKE_CASE` (constants), `kebab-case` (filenames)
- component props: declare a named interface (`IFoo`) — no inline type literals in params
- one-off scripts (`scripts/`, `jobs/`): run with `bun`

## Design system

Ships as **`@better-giving/ui`** (`packages/ui/`) — the components, the style layer, and the pure helpers, reached only through the package's exports. Nothing under `src/components/` belongs to it; what is left there is app-specific (route chrome, `rich-text`, `img-editor`, `donation`, and the `DappLogo` in `components/image`).

- **tokens** live in `packages/brand/src/colors.css`; **`packages/brand/design-system.md` is the ledger** — what each token is for, fills vs. legible text, the deliberate calls. Read it before reaching for a color.
- **entry points**: `@better-giving/ui` (the barrel), `@better-giving/ui/tooltip` and `/hover-card` (namespaced — both export `Arrow`/`Content`, and a flat barrel holds one of each), `/masks`, `/helpers` (`to_usd`, `unpack` — no react import, ever), `/styles.css`.
- `src/index.css` keeps only what is the app's: the `tailwindcss` import (the package must never issue its own), the `@source` registering `packages/ui/src` for content detection, the decorative marketing washes, and the `#donation-container` embed-runtime overrides.
- **app reaches are injected, not imported.** `FileDropzone` takes `upload` and `report_error` as props — that is why the package carries no Sentry and no knowledge of our API routes.
- **money formatting stayed here.** The system's `Amount` takes already-formatted strings; `src/components/money.tsx` (`Money`) owns the rounding and wraps it, because precision is a domain rule (`usdpu` picks the primary figure's decimals from its usd magnitude). `@/helpers/decimal` is the app's.

## UI

- always use the project's existing theme, design tokens, and component styles — never introduce new colors, spacing scales, or utility classes outside the system
- Tailwind v4 `@theme` resets all default colors (`--color-*: initial`); only the semantic tokens are available — never use raw Tailwind palette names (`gray-500`, `green`, `red`, etc.). The tokens are declared in `packages/brand/src/colors.css` and mapped to utilities in `packages/ui/src/styles/theme.css` (`@theme` + `@theme inline`); **`packages/brand/design-system.md` is the ledger** — what each token is for, which are fills vs. legible text (with measured contrast), and the decisions that look like bugs. Read it before reaching for a color.
- a tinted band is an authored surface + its own `-fg` (`destructive-subtle`/`-fg`, `warning-subtle`/`-fg`) — never `bg-<token>/10 text-<token>`, which measures ~2:1. `text-warning` is not legible at any size (2.15:1); use `text-warning-subtle-fg`.
- spacing/layout that affects external flow (margin, position, z-index) must be applied by the caller, not hardcoded inside the component
- **page shape is the exception, and it runs the other way.** `page-narrow` (72rem) and `page-wide` (96rem) in `packages/ui/src/styles/utilities.css` own their own max-width, inline centering and gutter (`px-5 md:px-10`); a caller must not re-specify any of the three. two utilities of equal specificity resolve by stylesheet source order, not class-string order, so a leftover `px-6`/`mx-auto`/`max-w-*` beside one of these is a coin flip that renders right on some sites and wrong on others. the full-bleed band that paints a section's background is a separate element wrapping the container and carries the fill and the vertical rhythm only — never a horizontal padding, which would stack a second gutter. narrow is reading and marketing, wide is browse; `xl:container` is gone and a sweep test fails if it returns.
- **one radius, and the ladder is closed.** `rounded` is the only corner name; `@utility rounded` in `packages/ui/src/styles/utilities.css` binds it to `--radius`, and the `--radius-*` scale is reset to `initial` in `packages/ui/src/styles/theme.css` so `rounded-sm`/`-md`/`-lg`/`-xl` **fail to compile** rather than drifting in as fractional 1.6-3.2px corners. `rounded-full` and `rounded-none` are unaffected (v4 emits those from literals). Side-specific corners (`rounded-t/-b/-l/-r`) are bound in the same file for the same reason — they derive from the scale, so closing it would otherwise take them down too.
- **two form-field languages, and the group picks between them.** `packages/ui/src/components/form/field.tsx` (`Field`) is the default: label above the control, used ~98 places. `packages/ui/src/components/form/floating-field.tsx` (`FloatingField` + `FloatingInput`) floats the label inside the control and is for a *group of adjacent fields* whose stacked top labels would read as a column of repeated small text — first/last name, street/city/zip. Floating is a property of the field group, not of the control, so a control never carries a "floating" variant of its own. `FloatingInput` forces `placeholder=""`: the recipe keys off `:placeholder-shown` to decide resting vs. raised, so a real placeholder pins the label up permanently.
- the focus-indicator idiom is `focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2` (`data-focus-visible:*` on ark parts that expose that attribute). `outline-ring` resolves to `--form-primary` inside `#donation-container`, so the same string is correct in the embedded form.
- **never put `outline-none` or `outline-hidden` on an element that also carries a `focus-visible:outline-*` replacement** — both set `--tw-outline-style: none`, and `outline-2` only sets `outline-style: var(--tw-outline-style)`, so the replacement computes to `outline-style: none` and paints nothing. Use `outline-0` (width 0, style preserved) to suppress a resting outline. Same trap with `focus:outline-hidden` beside `data-focus-visible:outline-*`, since the two states coincide.
- suppressing a resting outline under a *variant* (`@container`, `data-selected`) also outranks a plain `focus-visible:` rule — variants sort after it, so `@xl/steps:outline-0` wins over `focus-visible:outline-2` and kills the ring. Scope the suppression to the non-focused state instead (`@xl/steps:not-focus-visible:outline-0`), which is mutually exclusive and order-proof.
- a **selection** indicator is not a **focus** indicator: `data-selected:border-b-2`, `data-[state=checked]:bg-*` say which item is chosen, not which has keyboard focus. In a roving-tabindex group (radios, tabs) the two coincide, which is exactly why a `data-[state=checked]:outline-none` silently removes the focus ring.

## Gotchas

- **a hyphenated JSX attribute bypasses TypeScript's excess-property check.** `<Select aria-invalid={x} />` type-checks even though `Select` has no such prop and never spreads `...props` — so it silently does nothing. A non-hyphenated bogus prop errors normally. Any `aria-*` / `data-*` you hand a custom component is unverified by the compiler: confirm the component actually forwards it.

- **`required` on a `Field.Root` wrapping an Ark combobox silently breaks form submission.** `useCombobox` reads `required` off the field context and zag puts it on the **search input** (`getInputProps`); native constraint validation then swallows the form's submit event, so react-hook-form never runs its resolver, no message renders, and nothing logs. `packages/ui/src/components/select/internal/field-frame.tsx` withholds `required` from `Field.Root` for this reason — the asterisk comes from the label's `data-required`, the control carries `aria-required` itself, and requiredness is enforced by the schema.

- biome, not eslint — `pnpm format` to fix, `pnpm lint` to check
- biome enforces `useImportType` (warn) and `noUnusedImports` (warn) — use `import type` where possible
- formatter: spaces (not tabs), es5 trailing commas
- build output dir is `build/` (i.e. `apps/platform/build/`), not `dist/`
- resource routes (loader returns a `Response`, no component export — e.g. `api.*` endpoints) do NOT run the route `headers` export; React Router returns the loader `Response` as-is. Set `cache-control` (and any other headers) directly on the `Response` — e.g. `resp.json(x, 200, { "cache-control": ... })`. The `headers` export only applies to document routes (those with a default component).

## Skew Protection

- assets durable via vercel blob (vite `base` + `utils/upload-client-assets.ts`); no `.data` pinning (no `__vdpl` cookie, no header/query patch)
- keep loader/action contracts **additive-only** so old js hitting newer deploys is safe — never rename/remove response fields, request params, or routes; add new fields with safe defaults
- removed routes need server-side redirects to avoid old `<Link to>` 404s
