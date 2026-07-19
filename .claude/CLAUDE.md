# Better Giving Monorepo

Turborepo + pnpm workspace. Root is a thin turbo delegator with no app code; each workspace member carries its own `CLAUDE.md` for app-internal conventions (e.g. `platform/CLAUDE.md`).

## Layout

- **root** — `turbo.json` (task graph), `tsconfig.base.json` (repo-wide TS policy), `biome.json`, `lefthook.yml`, `pnpm-workspace.yaml`. No app code.
- **`apps/platform/`** — the web app (workspace member, package `platform`). All app code, deps, and its own `tsconfig.json` (extends `../../tsconfig.base.json`). See `apps/platform/CLAUDE.md`.
- **`apps/blog/`** — Sanity Studio (workspace member, package `blog`). Content source + schema for platform's `/blog`. See `apps/blog/CLAUDE.md`. **After any schema/query change, regen types + deploy — see `apps/blog/CLAUDE.md`.**
- **`apps/emails-preview/`** — react-email preview site (workspace member, package `emails-preview`, private, app). Depends on `emails` via `workspace:*`; renders each template as a preview entry (`email dev`/`email build`). Deployed as its **own Vercel project** (Root Directory = `apps/emails-preview`), independent of platform. See `apps/emails-preview/CLAUDE.md`.
- **`packages/emails/`** — React Email templates as a source package (internal package `emails`, private). Pure React component lib (`src/` only); consumed by platform via `workspace:*` — exports raw `.ts`/`.tsx` (`exports: "./src/index.ts"`), no build step / no `dist/`, platform's compiler transpiles it. Not deployable on its own. See `packages/emails/CLAUDE.md`.
- **`packages/types/blog/`** — internal package `blog-types`: blog's generated types + copied groq queries + hand-authored project coords, consumed by platform. blog produces, platform consumes; platform never imports blog directly.
- **`packages/paypal/`** — internal package `@better-giving/paypal` (private): a **built** server-side PayPal SDK (the `PayPalSDK` class platform imports). Hand-written `src/` over `openapi-typescript`-generated types (`src/generated/**` is committed source, refreshed by the `generate` script) → `tsc` → `dist/` (gitignored). Extends `tsconfig.base.json`; emits via raw `tsc`. See `packages/paypal/CLAUDE.md`.
- **`packages/crypto/`** — internal package `@better-giving/crypto` (private): a **built** crypto token + chain data lib, zero runtime deps. Built via **tsup** → `dist/index.mjs` + `.d.ts` (gitignored). Consumed by platform via `workspace:*`. `src/generated/**` JSON is committed source (occasional `generate-tokens` maintenance script), NOT a build artifact. Like every member it **extends `tsconfig.base.json`**; tsup owns emit. See `packages/crypto/CLAUDE.md`.
- **`apps/` = deployable apps** (`platform`, `blog`, `emails-preview`); **`packages/` = internal libraries** consumed via `workspace:*`.
- workspace members declared in `pnpm-workspace.yaml` (`packages: [apps/*, packages/crypto, packages/emails, packages/paypal, packages/types/*]`). Add a member there + give it a `package.json` and `tsconfig.json` that extends the base (built members included — they just add emit config on top).

## Commands

Run from repo root; turbo delegates into members:

- `pnpm dev` — `turbo run dev --filter=platform` (mprocs: app + ngrok + qstash)
- `pnpm dev:blog` — local Sanity Studio (or `pnpm --filter blog dev`)
- `pnpm dev:emails-preview` — local react-email preview server (or `pnpm --filter emails-preview dev`)
- `pnpm build` — `turbo run build`
- `pnpm test` — `turbo run test`
- `pnpm lint` — `biome check .` (single root pass, not turbo — see Tooling → Biome)
- `pnpm format` — `biome check --write .` (single root pass)

Invoke a member binary from anywhere: `pnpm --filter <pkg> exec <bin>`.

## Tooling (repo root)

- lefthook, biome, turbo, and `tsconfig.base.json` live at root — repo-wide, not per-package.
- **TS topology**: root `tsconfig.base.json` holds shared policy (strict, module/target, `noEmit`); each member's `tsconfig.json` extends it and layers on env/jsx/aliases/includes. Root has no `tsconfig.json` (only the base, which tsc never opens standalone) — lefthook `type-check` anchors on `apps/platform/tsconfig.json`. **Built members** (`packages/paypal`, `packages/crypto`) extend the base too and add their own emit config. Neither has a pre-commit `type-check` hook (built-member convention — type safety enforced by the build in turbo/CI).
- **Biome**: single root `biome.json` governs all members (upward traversal finds it for every file). Lint/format run as **one root pass** (`biome check .`) — not fanned out through turbo — so root-level files (`turbo.json`, `tsconfig.base.json`, etc.) and every member are covered at once. VCS integration is on (`vcs.useIgnoreFile`), so `.gitignore`d artifacts (`dist`, `build`, `.turbo`, `.react-router`, `coverage`, …) drop out automatically; the `files.includes` list only adds excludes VCS can't infer. `**/package.json` is excluded (biome would collapse hand-maintained arrays). Per-member `lint`/`format` scripts (scoped to `.`) exist for granular `--filter` runs and inherit the same root config. This is a **deliberate exception** to the turbo-delegator rule — biome is a single repo-aware binary, so a global pass beats per-package fan-out (which also can't reach root-level files); `turbo.json` intentionally defines **no** `lint`/`format` task. Turbo still owns `build`/`test`/`dev`/`typegen`.
- **Shared dep versions**: repo-wide `typescript`/`@types/node` versions live in the `pnpm-workspace.yaml` `catalog:` — members reference `"catalog:"`, not a pinned version. Node is pinned via root `.nvmrc` (`24`) + root `package.json` `engines.node` (source of truth; per-member `engines` don't inherit under pnpm and are just informational).
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
