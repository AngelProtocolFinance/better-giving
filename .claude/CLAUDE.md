# Better Giving Web App

## Commands

All via `pnpm`:

- `pnpm dev` — local dev server
- `pnpm build` — production build
- `pnpm test` — run all tests (`vitest --run`)
- `pnpm lint` — biome check `./src`
- `pnpm format` — biome check + write across `src lib .server jobs`

## Path Aliases

- `#/` → `src/`
- `@/` → `lib/`
- `$/` → `.server/`

## Architecture

Three-layer structure:

- **`src/`** — React Router routes, components, client code
- **`lib/`** — shared business logic, types, schemas (isomorphic)
- **`.server/`** — server-only code, pg schema, migrations, auth, queues

## Stack

- **Framework**: React Router v7 (SSR, framework mode)
- **DB**: PostgreSQL via drizzle-orm (neon in prod, local pg in dev); DynamoDB + dynamodb-toolbox v2 (legacy, migrating)
- **Validation**: valibot (preferred), zod also present
- **Forms**: react-hook-form + remix-hook-form
- **UI**: Tailwind v4, Base UI, Lucide icons, Motion
- **Linter/Formatter**: Biome (not ESLint/Prettier)
- **Testing**: Vitest + jsdom + Testing Library + MSW
- **Pre-commit**: Lefthook (biome check, tsc-files, vitest related)
- **Deploy**: Vercel

## Testing

- setup file: `src/setup-tests.ts`
- config in `vite.config.ts` under `test`
- environment: jsdom, globals enabled
- `.claude/**` excluded from test runs
- when running vitest on changed files, use `--bail 1 --changed` to fail fast and scope to changes only

## Environment

- Node 24, pnpm 10
- Strict TypeScript (`strict: true`)

## Code Style

- casing: `snake_case` (vars/fns), `PascalCase` (classes/components), `SCREAMING_SNAKE_CASE` (constants), `kebab-case` (filenames)
- component props: declare a named interface (`IFoo`) — no inline type literals in params
- always use `pnpm` — never `npx`, `npm`, `yarn`; for local bins prefer `pnpm <bin>` (or `pnpm exec`), for one-shots `pnpm dlx`
- pin deps to exact versions — `pnpm add <pkg> --save-exact` (no `^`/`~` ranges)
- one-off scripts (e.g. `scripts/`, `jobs/`): run with `bun`

## UI

- always use the project's existing theme, design tokens, and component styles — never introduce new colors, spacing scales, or utility classes outside the system
- Tailwind v4 `@theme` resets all default colors (`--color-*: initial`); only semantic tokens are available: `primary`, `secondary`, `muted`/`muted-fg`, `destructive`, `success`, `warning`, `accent`, `border`, `fg`, `card`, `popover` — never use raw Tailwind palette names (`gray-500`, `green`, `red`, etc.)
- spacing/layout that affects external flow (margin, position, z-index) must be applied by the caller, not hardcoded inside the component

## Git

- prod branch is `main` (not `master`)
- base PRs on the current working branch, not hardcoded to `main`

## Gotchas

- biome, not eslint — `pnpm format` to fix, `pnpm lint` to check
- lefthook pre-commit runs biome + type-check + related tests — don't skip with `--no-verify`
- biome enforces `useImportType` (warn) and `noUnusedImports` (warn) — use `import type` where possible
- formatter: spaces (not tabs), es5 trailing commas
- build output dir is `build/`, not `dist/`
- resource routes (loader returns a `Response`, no component export — e.g. `api.*` endpoints) do NOT run the route `headers` export; React Router returns the loader `Response` as-is. Set `cache-control` (and any other headers) directly on the `Response` — e.g. `resp.json(x, 200, { "cache-control": ... })`. The `headers` export only applies to document routes (those with a default component).

## Skew Protection

- assets durable via vercel blob (vite `base` + `utils/upload-client-assets.ts`); no `.data` pinning (no `__vdpl` cookie, no header/query patch)
- keep loader/action contracts **additive-only** so old js hitting newer deploys is safe — never rename/remove response fields, request params, or routes; add new fields with safe defaults
- removed routes need server-side redirects to avoid old `<Link to>` 404s
