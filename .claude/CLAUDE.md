# Better Giving Monorepo

Turborepo + pnpm workspace. Root is a thin turbo delegator with no app code; each workspace member carries its own `CLAUDE.md` for app-internal conventions (e.g. `platform/CLAUDE.md`).

## Layout

- **root** — `turbo.json` (task graph), `tsconfig.base.json` (repo-wide TS policy), `biome.json`, `lefthook.yml`, `pnpm-workspace.yaml`. No app code.
- **`apps/platform/`** — the web app (workspace member, package `platform`). All app code, deps, and its own `tsconfig.json` (extends `../../tsconfig.base.json`). See `apps/platform/CLAUDE.md`.
- **`apps/blog/`** — Sanity Studio (workspace member, package `blog`). Content source + schema for platform's `/blog`. See `apps/blog/CLAUDE.md`. **After any schema/query change, regen types + deploy — see `apps/blog/CLAUDE.md`.**
- **`apps/emails-preview/`** — react-email preview site (workspace member, package `emails-preview`, private, app). Depends on `emails` via `workspace:*`; renders each template as a preview entry (`email dev`/`email build`). Deployed as its **own Vercel project** (Root Directory = `apps/emails-preview`), independent of platform. See `apps/emails-preview/CLAUDE.md`.
- **`apps/docs/`** — developer docs + donation-form embed showcase (workspace member, package `docs`, private). React Router v7 SSR app (`appDirectory: "src"`, `#/` → `src/`, fs-routes, Tailwind v4, shiki) — the `/forms/$id` playgrounds iframe platform's donation form at various sizes, plus a `demo-nonprofit` page. Depends on `@better-giving/brand` via `workspace:*`. Deployed as its **own Vercel project** (Root Directory = `apps/docs`, `vercelPreset()` in `react-router.config.ts`). Only env is the optional `VITE_BG_FORM_ID` (see `.env.example`); has no `test` task. No `CLAUDE.md` of its own — it follows platform's conventions.
- **`packages/emails/`** — React Email templates as a source package (internal package `emails`, private). Pure React component lib (`src/` only); consumed by platform via `workspace:*` — exports raw `.ts`/`.tsx` (`exports: "./src/index.ts"`), no build step / no `dist/`, platform's compiler transpiles it. Not deployable on its own. See `packages/emails/CLAUDE.md`.
- **`packages/types/blog/`** — internal package `blog-types`: blog's generated types + copied groq queries + hand-authored project coords, consumed by platform. blog produces, platform consumes; platform never imports blog directly.
- **`packages/paypal/`** — internal package `@better-giving/paypal` (private): a **built** server-side PayPal SDK (the `PayPalSDK` class platform imports). Hand-written `src/` over `openapi-typescript`-generated types (`src/generated/**` is committed source, refreshed by the `generate` script) → `tsc` → `dist/` (gitignored). Extends `tsconfig.base.json`; emits via raw `tsc`. See `packages/paypal/CLAUDE.md`.
- **`packages/chariot/`** — internal package `@better-giving/chariot` (private): a **built** server-side Chariot DAF SDK (the `Chariot` class platform imports). Hand-written `src/` over `openapi-typescript`-generated types (`src/generated/**` is committed source, refreshed by the `generate` script over the vendored `specs/chariot.yaml`) → `tsc` → `dist/` (gitignored). Extends `tsconfig.base.json`; emits via raw `tsc` — same pattern as paypal. See `packages/chariot/CLAUDE.md`.
- **`packages/crypto/`** — internal package `@better-giving/crypto` (private): a **built** crypto token + chain data lib, zero runtime deps. Built via **tsup** → `dist/index.mjs` + `.d.ts` (gitignored). Consumed by platform via `workspace:*`. `src/generated/**` JSON is committed source (occasional `generate-tokens` maintenance script), NOT a build artifact. Like every member it **extends `tsconfig.base.json`**; tsup owns emit. See `packages/crypto/CLAUDE.md`.
- **`packages/stocks/`** — internal package `@better-giving/stocks` (private): a **built** stock ticker + broker-dealer data lib, zero runtime deps. `"type": "module"`; built via **tsup** → `dist/index.js` + `.d.ts` (gitignored). Consumed by platform via `workspace:*`. `src/generated/**` JSON is committed source (occasional `generate-tickers`/`generate-brokers` maintenance scripts), NOT a build artifact. Like every member it **extends `tsconfig.base.json`**; tsup owns emit. See `packages/stocks/CLAUDE.md`.
- **`packages/brand/`** — internal package `@better-giving/brand` (private): the canonical Better Giving identity — legal identity (`LEGAL_NAME`/`EIN`/`ADDRESS`), social profile urls (`socials`), and the design-token color palette, in `src/index.ts`. **Source-only** (no build, no `dist/`) — consumers transpile it. `socials` is shared by platform (spread into its wider `socials` map in `src/constants/urls.ts`) and the docs footer. The palette is exposed two ways for two different consumers: `colors.css` (`:root`/`.dark`, real `oklch()`) is `@import`ed verbatim by platform's `src/index.css` — mail clients can't do that, so `colors.ts` mirrors the light half as flat hex (`oklch_to_hex` in `oklch.ts`, a Color-4 reference conversion) for the email templates in `packages/emails`. `colors.test.ts` parses `colors.css` and fails if `colors.ts` ever drifts from it, key-for-key — so a new literal `oklch()` token in `:root` must land in `colors.ts` in the same commit, while `var()`/`color-mix()` tokens have no email twin by rule. **`design-system.md` is the token ledger** (what each token is for, fill vs. legible-text with measured contrast, the deliberate calls) — it sits beside `colors.css` because both consumers read from here, not from platform. Zero runtime deps; no `CLAUDE.md`.
- **`apps/` = deployable apps** (`platform`, `blog`, `docs`, `emails-preview`); **`packages/` = internal libraries** consumed via `workspace:*`.
- workspace members declared in `pnpm-workspace.yaml` (`packages: [apps/*, packages/brand, packages/chariot, packages/crypto, packages/emails, packages/paypal, packages/stocks, packages/types/*]`). Add a member there + give it a `package.json` and `tsconfig.json` that extends the base (built members included — they just add emit config on top).

## Commands

Run from repo root; turbo delegates into members:

- `pnpm dev` — `turbo run dev --filter=platform` (just the vite dev server on :4200)
- `pnpm dev:blog` — local Sanity Studio (or `pnpm --filter blog dev`)
- `pnpm dev:emails-preview` — local react-email preview server (or `pnpm --filter emails-preview dev`)
- `pnpm --filter docs dev` — local docs/embed-showcase app (no root alias)
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
- **Pre-commit**: lefthook runs biome check and tsc-files (per-member, staged-file scoped); the only test hook is `test-brand`, scoped to `packages/brand`. Don't skip with `--no-verify`.
- **Claude config**: a single root `.claude/` — skills live in `.claude/skills/<name>/SKILL.md` (dir + `SKILL.md`, never a bare `<name>.md`), never nested inside a workspace member. Member-scoped skills go at root too and declare their jurisdiction in the body (e.g. "**Jurisdiction: `apps/platform/`**" + paths relative to it), and any `globs:` are repo-root-relative (`apps/platform/src/**`). Rationale: skills under `apps/*/.claude` are directory-scoped — they don't appear in `/` autocomplete and are hard to discover.

## Package management

- always use `pnpm` — never `npx`, `npm`, `yarn`; local bins `pnpm <bin>` (or `pnpm exec`), one-shots `pnpm dlx`
- pin deps to exact versions — `pnpm add <pkg> --save-exact` (no `^`/`~` ranges)
- Node 24, pnpm 10; strict TypeScript (`strict: true`)

## Deploy

- **platform** — Vercel, Root Directory = `apps/platform`. No Ignored Build Step is set (all three Vercel projects are `null` there); builds are skipped instead by Vercel's **native affected-projects skip** (`enableAffectedProjectsDeployments: true`). Preferred over an Ignored Build Step / `turbo-ignore` because the native skip doesn't occupy a concurrent build slot — this team is capped at **one**.
- **CI gate** — `.github/workflows/ci.yml` runs two jobs, `checks` (biome + `turbo run typecheck`) and `test`. Vercel imports them as **Deployment Checks** on the platform project and holds promotion to the production domain until the required ones pass. Three things about that setup are load-bearing: **job names are the check identifiers** (renaming one silently breaks the gate); the workflow deliberately has **no `paths:` filters, no `if:` on jobs, and no `concurrency` block** (a run that never happens produces no check run, and Vercel's handling of a missing/cancelled check is undocumented); and it never runs the apps' own `build` — Vercel already does. **Which checks are required lives only in the Vercel dashboard** — there is no `vercel.json` key or committed equivalent for the GitHub-import path, so it can drift from this file the way the `turbo-ignore` claim above once did. Note also that the gate covers **only the production custom domain** — the `staging` custom environment deploys ungated, and **that is a platform limit, not an oversight**: vercel defines deployment checks as "conditions that must be met before promoting a production build to your production environment" and requires production automatic aliasing to add them, so custom environments have no equivalent. gating `staging` from the github side doesn't work either — required status checks gate *merges*, and `staging` receives feature-branch tips pushed directly. the workflow does run on `push: staging`, so the result is visible on the commit; it just can't block.
- **emails-preview** — separate Vercel project, Root Directory = `apps/emails-preview`; builds the react-email preview site via its `build` script (see `apps/emails-preview/vercel.json`), which also runs in the root `turbo run build`. Independent of platform's deploy. `emails` (the package) has no build and does not deploy.

## Git

- prod branch is `main` (not `master`)
- **`main` takes direct pushes** — there is no pr requirement and no required status check on merge. the only
  rules are `deletion` + `non_fast_forward` (github ruleset `default`, active, **no bypass actors** — admins
  included), so history can't be rewritten or the branch dropped. gating happens at *release*, not at merge:
  a red commit still builds, it just never reaches the production domain (see Deploy → CI gate). don't add a
  pr/status-check rule without asking — direct-to-`main` is deliberate.
- base PRs on the current working branch, not hardcoded to `main`
