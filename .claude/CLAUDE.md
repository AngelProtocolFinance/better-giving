# Better Giving Monorepo

Turborepo + pnpm workspace. Root is a thin turbo delegator with no app code. **Each member's own `CLAUDE.md` is the authority on that member — read it before working there.** This file carries only what spans members.

<!-- team-justin v0.54.0 · derived 2026-09-03 · /team-justin:deploy to re-derive -->
## Team

Load **`team-justin:lead`** before building, reviewing, or dispatching a seat — it carries how the team works.

- **routes** → `team-justin:react-router-builder` — react-router 7.16.0 + `@react-router/fs-routes` (platform, docs)
- **ui** → `team-justin:react-ui-builder` — `@ark-ui/react` 5.37.2 + tailwind 4.3.1 over `packages/ui`
- **data** → `team-justin:postgres-architect` — drizzle-orm 0.45.2 + `@neondatabase/serverless`; drizzle-kit migrations, `@electric-sql/pglite` in tests
- **auth** → `team-justin:better-auth-specialist` — better-auth 1.6.22
- **payments** → `team-justin:stripe-specialist` — stripe 22.6.0. Stripe only; no seat owns the paypal/chariot/crypto/stocks SDKs
- **cms** → `team-justin:sanity-builder` — `apps/blog` + `@sanity/client` 7.22.1 in platform
- **platform** → `team-justin:vercel-platform-engineer` — `@vercel/react-router` 1.3.1 + `vercelPreset`
- **toolchain** → `team-justin:toolchain-engineer` — turbo 2.10.5, biome 2.4.15, pnpm 10.32.1
- **skills** → `team-justin:drizzle` — drizzle-orm 0.45.2 in `apps/platform`. The only library conditional this repo hits: validation is valibot, forms are react-hook-form + remix-hook-form.
- **not a seat** — `next` 16.2.6 in `apps/emails-preview` is `email build`'s toolchain, which generates a throwaway Next app into `.react-email/`. No App Router source exists in the repo; routing off that manifest to `nextjs-builder` is a mis-route.
- **project seats** — `.claude/skills/`: `platform-tests`, `db-admin`, `chariot-webhooks`, `upstash-manager`, `wise`. Prefer these over a plugin seat wherever they overlap; `platform-tests` outranks `test-writer` on platform's tests

A slice reaching a stack no seat above covers is a question for the user, naming the seat it would need — never a nearby seat pressed into the gap.

## Layout

`apps/` = apps, `packages/` = internal libraries consumed via `workspace:*`. Members are declared in `pnpm-workspace.yaml`; a new one needs an entry there plus a `package.json` and a `tsconfig.json` extending `tsconfig.base.json` (built members included — they add emit config on top). Four apps deploy (`platform`, `blog`, `docs`, `emails-preview`); `design-sync` is local-only by decision, below.

**Members with a `CLAUDE.md`** — their layout, build, public API and conventions live there, not here:

- **`apps/platform/`** — the web app (package `platform`). Read `apps/platform/CLAUDE.md` before writing app code: path aliases, the `src`/`lib`/`.server` layer boundaries, stack, testing.
- **`apps/blog/`** — Sanity Studio; content source for platform's `/blog`. Read `apps/blog/CLAUDE.md` **before any `schemaTypes/` or `queries.ts` edit** — nothing guards against drift, and the edit is only half-done until its typegen/deploy step and the regenerated `blog-types` artifacts are staged with it.
- **`apps/emails-preview/`** — react-email preview site on its own Vercel project. Read `apps/emails-preview/CLAUDE.md` when adding a preview entry, bumping `react-email`, or touching its `vercel.json` — both the version floor and the `buildCommand` prefix are load-bearing.
- **`packages/emails/`** — React Email templates, source-only, transpiled by platform. See `packages/emails/CLAUDE.md`.
- **`packages/paypal/`, `packages/chariot/`** — built server-side SDKs (`PayPalSDK`, `Chariot`) over `openapi-typescript` types, emitting via raw `tsc`. See each member's `CLAUDE.md`.
- **`packages/crypto/`, `packages/stocks/`** — built zero-dep data libs (crypto tokens + chains; stock tickers + broker-dealers), emitting via tsup. See each member's `CLAUDE.md`.

Two conventions those four built packages share, and a fifth would inherit: `src/generated/**` is **committed source** refreshed by an occasional `generate` script — never a turbo `output`; and none carries a pre-commit `type-check` hook, because the package's build in turbo/CI is the type gate.

**Members with no `CLAUDE.md`** — this is their only documentation:

- **`apps/docs/`** — developer docs + donation-form embed showcase (private). React Router v7 SSR (`appDirectory: "src"`, `#/` → `src/`, fs-routes, Tailwind v4, shiki); `/forms/$id` iframes platform's donation form at various sizes. On `@better-giving/ui`'s stylesheet and token palette, so a raw tailwind palette name (`neutral-200`, `blue-600`) does not compile here either; it uses the shared `Copier`/`ExtLink`. **`routes/demo-nonprofit.tsx` is the one deliberate exception** — it impersonates a FICTIONAL nonprofit so the embedded form is seen in somebody else's design, so its brand colors come from the `--color-demo-*` set in `src/index.css` and must never be system tokens (its plain greys stay the semantic neutrals — grey is not an identity). Own Vercel project; only env is the optional `VITE_BG_FORM_ID`; no `test` task. Otherwise follows platform's conventions.
- **`packages/brand/`** — the canonical Better Giving identity: legal identity (`LEGAL_NAME`/`EIN`/`ADDRESS`), `socials`, and the color palette. Source-only. The palette is **light-only** — the `.dark` set was deleted 2026-08-19 as unreachable (no toggle, no `prefers-color-scheme`); read `design-system.md` before re-deriving one. It ships twice for two consumers: `colors.css` (`:root`, real `oklch()`), `@import`ed verbatim by platform's `src/index.css`, and `colors.ts`, the flat-hex mirror the email templates need because mail clients can't `@import`. **`colors.test.ts` fails if the two drift**, so a new literal `oklch()` token in `:root` must land in `colors.ts` in the same commit; `var()`/`color-mix()` tokens have no email twin by rule. **`design-system.md` is the token ledger**, described where colors get reached for (`apps/platform/CLAUDE.md`).
- **`packages/ui/`** — the platform design system: shared React components, the CSS style layer, and pure TS helpers. Source-only for TS, with three export entries for three consumers: `.` (components, drags React), `./helpers` (pure TS), `./styles.css` (the source stylesheet platform's own single Tailwind pass `@import`s — this is *where the shared layer lives*, not how platform gets its CSS). It does build one CSS artifact (`pnpm --filter @better-giving/ui build` → `dist/styles.css`, gitignored) at a stable non-hashed path, for external tooling like design-sync that can't read a content-hashed Vite output.
- **`packages/types/blog/`** — package `blog-types`: blog's generated types + copied groq queries + hand-authored project coords. blog produces, platform consumes; platform never imports blog directly.
- **`apps/design-sync/`** — everything `/design-sync` needs to publish `packages/ui` to claude.ai/design: `.design-sync/config.json`, `entry.tsx`, the 40 preview files, `NOTES.md`, and the converter's own deps. **Run every design-sync command from this directory** — the skill resolves `.design-sync/config.json` against the cwd, so a run started at the repo root reads no config, treats it as a first-time import, and creates a *second* claude.ai/design project; nothing at the root catches that (see `NOTES.md`). It is the one `apps/` member that does not deploy, on purpose (2026-08-21): `pnpm --filter design-sync preview` serves the emitted bundle locally, and a fourth Vercel project would cost an ops slot on a team capped at **one** concurrent build for a look-at-it tool. Nothing enforces deployability for `apps/` membership — turbo keys on task names, Vercel on each project's Root Directory, biome/lefthook on explicit paths.

## Commands

Task scripts live in the root `package.json`; run them from the root and turbo delegates into members. What the scripts don't show:

- `pnpm dev` serves platform alone, on :4200.
- `docs` has no root alias — `pnpm --filter docs dev`.
- `lint`/`format` are one root `biome check` pass, deliberately not a turbo task (see Tooling → Biome).
- Invoke any member binary from anywhere: `pnpm --filter <pkg> exec <bin>`.

## Tooling (repo root)

- lefthook, biome, turbo, and `tsconfig.base.json` live at root — repo-wide, not per-package.
- **TS topology**: `tsconfig.base.json` holds shared policy (strict, module/target, `noEmit`); every member extends it and layers on env/jsx/aliases/includes. There is no root `tsconfig.json` — tsc never opens the base standalone, which is why each lefthook type-check hook anchors on a member's config (`lefthook.yml` says which and why).
- **Biome**: the single root `biome.json` governs every member by upward traversal, and lint/format run as **one root pass** rather than fanning out through turbo — a deliberate exception to the turbo-delegator rule, because biome is a single repo-aware binary and a per-package fan-out can't reach root-level files (`turbo.json`, `tsconfig.base.json`). So `turbo.json` intentionally defines **no** `lint`/`format` task; turbo owns `build`/`test`/`dev`/`typegen`/`typecheck`. Per-member `lint`/`format` scripts exist only for granular `--filter` runs and inherit the same config. `**/package.json` is excluded because biome would collapse hand-maintained arrays. (`biome.json` is strict JSON and can't carry comments — that's why this rationale lives here.)
- **`build` outputs must cover every artifact Vercel's build step reads, not just the app's own build dir.** A cache-hit build that drops one fails silently by construction: turbo reports success and Vercel ships whatever partial output survived. This already cost a deployment with no serverless function at all — see the `outputs` comments in `turbo.json`. When a member adds a Vercel preset or adapter, check what it writes on disk and list it.
- **Pre-commit**: lefthook runs biome check plus per-member, staged-file-scoped tsc-files; `lefthook.yml` documents each hook's anchor and each deliberate omission. Let the hooks run — `--no-verify` is not the fix for a red one.
- **Claude config**: a single root `.claude/`. Skills live at `.claude/skills/<name>/SKILL.md` (a directory with `SKILL.md`, never a bare `<name>.md`), always at root even when member-scoped — a skill under `apps/*/.claude` is directory-scoped, missing from `/` autocomplete and hard to discover. A member-scoped skill declares its jurisdiction in the body (e.g. "**Jurisdiction: `apps/platform/`**" + paths relative to it), and any `globs:` are repo-root-relative (`apps/platform/src/**`).

## Package management

- always use `pnpm` — local bins `pnpm <bin>` (or `pnpm exec`), one-shots `pnpm dlx`. Never `npx`, `npm`, `yarn`.
- pin deps to exact versions — `pnpm add <pkg> --save-exact` (no `^`/`~` ranges).

## Deploy

- **platform** — Vercel, Root Directory = `apps/platform`. No Ignored Build Step is set on any of the three Vercel projects; builds are skipped by Vercel's **native affected-projects skip** (`enableAffectedProjectsDeployments: true`), preferred over an Ignored Build Step / `turbo-ignore` because the native skip doesn't occupy a concurrent build slot — and this team is capped at **one**.
- **emails-preview** — separate Vercel project (Root Directory = `apps/emails-preview`), building the preview site independently of platform. `emails` (the package) has no build and does not deploy.
- **CI gate** — `.github/workflows/ci.yml` runs two jobs, `checks` (biome + `turbo run typecheck`) and `test`; Vercel imports them as **Deployment Checks** on the platform project and holds promotion to the production domain until the required ones pass. **The workflow comments its own trade-offs** — trigger scope, the missing `paths:`/`if:`/`concurrency`, sha-pinned actions, blacksmith, remote caching, why it never runs the apps' `build`, and that the job names are the check identifiers. Read them before editing it. Three things it can't tell you, because they live outside the repo:
  - **Which checks are required lives only in the Vercel dashboard.** There is no committed equivalent for the GitHub-import path, so it can drift from this file.
  - **Actions is gated at the org, not the repo** — `AngelProtocolFinance` allow-lists repos individually. Before `better-giving` was added, even a repo-admin `PUT .../actions/permissions` returned 409 and no workflow ran at all.
  - **The gate covers only the production custom domain.** The `staging` custom environment deploys ungated, and that is a platform limit, not an oversight: Vercel defines deployment checks as conditions for promoting to *production* and requires production automatic aliasing, so custom environments have no equivalent. Gating from the GitHub side doesn't work either — required status checks gate *merges*, and `staging` receives feature-branch tips pushed directly.
## Git

- prod branch is `main` (not `master`).
- **`main` takes direct pushes** — no PR requirement, no required status check on merge. The only rules are `deletion` + `non_fast_forward` (github ruleset `default`, **no bypass actors**, admins included), so history can't be rewritten or the branch dropped. Gating happens at *release*, not at merge: a red commit still builds, it just never reaches the production domain (Deploy → CI gate). Direct-to-`main` is deliberate — ask before adding a PR or status-check rule.
- base PRs on the current working branch, not hardcoded to `main`.
