# Better Giving Web App

The web app — a workspace member (`better-giving`) of the Better Giving monorepo. Repo-wide layout, commands, tooling, deploy, and package-management rules live in the root `CLAUDE.md`; this file covers app-internal conventions. Paths here are relative to `platform/`.

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
- **DB**: PostgreSQL via drizzle-orm (neon in prod, local pg in dev); DynamoDB + dynamodb-toolbox v2 (legacy, migrating)
- **Validation**: valibot
- **Forms**: react-hook-form + remix-hook-form
- **UI**: Tailwind v4, Ark UI, Lucide icons, Motion
- **Testing**: Vitest browser mode (playwright/chromium) + vitest-browser-react + MSW

## Testing

- setup files: `src/setup-tests-browser.ts`, `src/__tests__/mocks/payment.tsx`
- config in `vite.config.ts` under `test`
- environment: vitest browser mode, headless chromium via playwright; globals enabled
- `.claude/**` excluded from test runs
- when running vitest on changed files, use `--bail 1 --changed` to fail fast and scope to changes only

## Code Style

- casing: `snake_case` (vars/fns), `PascalCase` (classes/components), `SCREAMING_SNAKE_CASE` (constants), `kebab-case` (filenames)
- component props: declare a named interface (`IFoo`) — no inline type literals in params
- one-off scripts (`scripts/`, `jobs/`): run with `bun`

## UI

- always use the project's existing theme, design tokens, and component styles — never introduce new colors, spacing scales, or utility classes outside the system
- Tailwind v4 `@theme` resets all default colors (`--color-*: initial`); only semantic tokens are available: `primary`, `secondary`, `muted`/`muted-fg`, `destructive`, `success`, `warning`, `accent`, `border`, `fg`, `card`, `popover` — never use raw Tailwind palette names (`gray-500`, `green`, `red`, etc.)
- spacing/layout that affects external flow (margin, position, z-index) must be applied by the caller, not hardcoded inside the component

## Gotchas

- biome, not eslint — `pnpm format` to fix, `pnpm lint` to check
- biome enforces `useImportType` (warn) and `noUnusedImports` (warn) — use `import type` where possible
- formatter: spaces (not tabs), es5 trailing commas
- build output dir is `build/` (i.e. `platform/build/`), not `dist/`
- resource routes (loader returns a `Response`, no component export — e.g. `api.*` endpoints) do NOT run the route `headers` export; React Router returns the loader `Response` as-is. Set `cache-control` (and any other headers) directly on the `Response` — e.g. `resp.json(x, 200, { "cache-control": ... })`. The `headers` export only applies to document routes (those with a default component).

## Skew Protection

- assets durable via vercel blob (vite `base` + `utils/upload-client-assets.ts`); no `.data` pinning (no `__vdpl` cookie, no header/query patch)
- keep loader/action contracts **additive-only** so old js hitting newer deploys is safe — never rename/remove response fields, request params, or routes; add new fields with safe defaults
- removed routes need server-side redirects to avoid old `<Link to>` 404s
