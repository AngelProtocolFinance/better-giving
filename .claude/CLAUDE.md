# Better Giving Monorepo

Turborepo + pnpm workspace. Root is a thin turbo delegator with no app code; each workspace member carries its own `CLAUDE.md` for app-internal conventions (e.g. `platform/CLAUDE.md`).

## Layout

- **root** — `turbo.json` (task graph), `tsconfig.base.json` (repo-wide TS policy), `biome.json`, `lefthook.yml`, `pnpm-workspace.yaml`. No app code.
- **`apps/platform/`** — the web app (workspace member, package `platform`). All app code, deps, and its own `tsconfig.json` (extends `../../tsconfig.base.json`). See `apps/platform/CLAUDE.md`.
- **`apps/blog/`** — Sanity Studio (workspace member, package `blog`). Content source + schema for platform's `/blog`. See `apps/blog/CLAUDE.md`. **After any schema/query change, regen types + deploy — see `apps/blog/CLAUDE.md`.**
- **`apps/emails-preview/`** — react-email preview site (workspace member, package `emails-preview`, private, app). Depends on `emails` via `workspace:*`; renders each template as a preview entry (`email dev`/`email build`). Deployed as its **own Vercel project** (Root Directory = `apps/emails-preview`), independent of platform. See `apps/emails-preview/CLAUDE.md`.
- **`packages/emails/`** — React Email templates as a source package (internal package `emails`, private). Pure React component lib (`src/` only); consumed by platform via `workspace:*` — exports raw `.ts`/`.tsx` (`exports: "./src/index.ts"`), no build step / no `dist/`, platform's compiler transpiles it. Not deployable on its own. See `packages/emails/CLAUDE.md`.
- **`packages/types/blog/`** — internal package `blog-types`: blog's generated types + copied groq queries + hand-authored project coords, consumed by platform. blog produces, platform consumes; platform never imports blog directly.
- **`packages/paypal-sdk/`** — internal package `@better-giving/paypal-sdk` (private): a **built** codegen SDK for PayPal REST APIs. OpenAPI specs → `generate` → `tsc` → `dist/` (both gitignored). The lone member that emits + ships `dist/` and does NOT extend `tsconfig.base.json` (base is `noEmit`). See `packages/paypal-sdk/CLAUDE.md`.
- **`apps/` = deployable apps** (`platform`, `blog`, `emails-preview`); **`packages/` = internal libraries** consumed via `workspace:*`.
- workspace members declared in `pnpm-workspace.yaml` (`packages: [apps/*, packages/emails, packages/paypal-sdk, packages/types/*]`). Add a member there + give it a `package.json` and `tsconfig.json` that extends the base (paypal-sdk is the exception — it emits, so it stands alone).

## Commands

Run from repo root; turbo delegates into members:

- `pnpm dev` — `turbo run dev --filter=platform` (mprocs: app + ngrok + qstash)
- `pnpm dev:blog` — local Sanity Studio (or `pnpm --filter blog dev`)
- `pnpm dev:emails-preview` — local react-email preview server (or `pnpm --filter emails-preview dev`)
- `pnpm build` — `turbo run build`
- `pnpm test` — `turbo run test`
- `pnpm lint` — `turbo run lint`
- `pnpm format` — `turbo run format`

Invoke a member binary from anywhere: `pnpm --filter <pkg> exec <bin>`.

## Tooling (repo root)

- lefthook, biome, turbo, and `tsconfig.base.json` live at root — repo-wide, not per-package.
- **TS topology**: root `tsconfig.base.json` holds shared policy (strict, module/target, `noEmit`); each member's `tsconfig.json` extends it and layers on env/jsx/aliases/includes. Root has no `tsconfig.json` (only the base, which tsc never opens standalone) — lefthook `type-check` anchors on `apps/platform/tsconfig.json`. **Exception: `packages/paypal-sdk`** is a build package — its `tsconfig.json` is standalone (does not extend the base) so it can emit `dist/`; it has no pre-commit `type-check` hook (its `src/` imports gitignored generated code, absent pre-commit — type safety enforced by the build in turbo/CI).
- **Biome**: single root `biome.json` governs all members (upward traversal finds it for every file).
- **Pre-commit**: lefthook runs biome check, tsc-files, and related vitest — don't skip with `--no-verify`.

## Package management

- always use `pnpm` — never `npx`, `npm`, `yarn`; local bins `pnpm <bin>` (or `pnpm exec`), one-shots `pnpm dlx`
- pin deps to exact versions — `pnpm add <pkg> --save-exact` (no `^`/`~` ranges)
- Node 24, pnpm 10; strict TypeScript (`strict: true`)

## Deploy

- **platform** — Vercel, Root Directory = `apps/platform`; Ignored Build Step = `npx turbo-ignore`.
- **emails-preview** — separate Vercel project, Root Directory = `apps/emails-preview`; builds the react-email preview site via its `build` script (see `apps/emails-preview/vercel.json`), which also runs in the root `turbo run build`. Independent of platform's deploy. `emails` (the package) has no build and does not deploy.

## Git

- prod branch is `main` (not `master`)
- base PRs on the current working branch, not hardcoded to `main`
