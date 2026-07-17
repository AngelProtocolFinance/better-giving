# Better Giving Monorepo

Turborepo + pnpm workspace. Root is a thin turbo delegator with no app code; each workspace member carries its own `CLAUDE.md` for app-internal conventions (e.g. `platform/CLAUDE.md`).

## Layout

- **root** — `turbo.json` (task graph), `tsconfig.base.json` (repo-wide TS policy), `biome.json`, `lefthook.yml`, `pnpm-workspace.yaml`. No app code.
- **`platform/`** — the web app (workspace member, package `better-giving`). All app code, deps, and its own `tsconfig.json` (extends `../tsconfig.base.json`). See `platform/CLAUDE.md`.
- workspace members declared in `pnpm-workspace.yaml` (`packages: [platform]`). Add a member there + give it a `package.json` and `tsconfig.json` that extends the base.

## Commands

Run from repo root; turbo delegates into members:

- `pnpm dev` — `turbo run dev --filter=platform` (mprocs: app + ngrok + qstash)
- `pnpm build` — `turbo run build`
- `pnpm test` — `turbo run test`
- `pnpm lint` — `turbo run lint`
- `pnpm format` — `turbo run format`

Invoke a member binary from anywhere: `pnpm --filter <pkg> exec <bin>`.

## Tooling (repo root)

- lefthook, biome, turbo, and `tsconfig.base.json` live at root — repo-wide, not per-package.
- **TS topology**: root `tsconfig.base.json` holds shared policy (strict, module/target, emit); each member's `tsconfig.json` extends it and layers on env/jsx/aliases/includes. Root has no `tsconfig.json` (only the base, which tsc never opens standalone) — lefthook `type-check` anchors on `platform/tsconfig.json`.
- **Biome**: single root `biome.json` governs all members (upward traversal finds it for every file).
- **Pre-commit**: lefthook runs biome check, tsc-files, and related vitest — don't skip with `--no-verify`.

## Package management

- always use `pnpm` — never `npx`, `npm`, `yarn`; local bins `pnpm <bin>` (or `pnpm exec`), one-shots `pnpm dlx`
- pin deps to exact versions — `pnpm add <pkg> --save-exact` (no `^`/`~` ranges)
- Node 24, pnpm 10; strict TypeScript (`strict: true`)

## Deploy

- Vercel, Root Directory = `platform`; Ignored Build Step = `npx turbo-ignore`.

## Git

- prod branch is `main` (not `master`)
- base PRs on the current working branch, not hardcoded to `main`
