---
name: verify-platform
description: "Drive the Better Giving web app (apps/platform) in a headless browser the way a visitor does — landing, sign-in, marketplace, and donate — and write screenshots, ARIA snapshots, and results.json. Use after a change to platform UI, routes, loaders, or the donation form, before calling that work done."
---

# verify-platform

Scripted proof for `apps/platform`. It boots the app against a throwaway Postgres using only committed filler secrets (`apps/platform/.env.test`), drives four visitor flows with Playwright, and leaves evidence in `$VERIFY_OUT`. Nothing here talks to Neon, Vercel, or production.

The directory name is `verify-platform` (`.cursor/skills/verify-<app>/`).

## Launch

Host prerequisites, once per machine:

- Node 24 (`.nvmrc`) and pnpm 12.4.2, on `PATH`.
- A frozen install from the repo root: `pnpm install --frozen-lockfile`.
- The `postgresql` package, so `initdb`, `postgres`, and `psql` exist. The launcher does not use a system Postgres service.
- Playwright's Chromium: `pnpm --filter platform exec playwright install chromium`.

`pnpm dev` is not a verification launch. It expects a developer database. This skill starts from an empty data directory instead.

```bash
.cursor/skills/verify-platform/scripts/launch.sh
```

`scripts/launch.sh` exports the defaults below and execs `.claude/skills/verify-platform/scripts/launch.sh`. That launcher is the repo's existing empty-directory boot: local Postgres, migrations, seed (`Verify Test Nonprofit`, USD rates), then `react-router dev --mode verify` on `127.0.0.1`. It writes `apps/platform/.env.verify` (gitignored, mode 0600) from `.env.test` plus the local database URL. Mode files beat `.env`, so a developer's real `.env` is not applied. The Neon driver preload refuses a non-localhost `DATABASE_URL`. While `STRIPE_SECRET_KEY` is filler, server-side Stripe calls hit an in-process stub and are logged.

Ready means `GET /` returns 200, not merely that the process is alive. The first boot also builds `packages/*` and compiles the root route; expect tens of seconds, and the launcher waits up to three minutes.

Defaults (override together when a second instance is required):

| variable | default |
| --- | --- |
| `VERIFY_STATE` | `/tmp/bg-verify-cursor` |
| `VERIFY_PG_DIR` | `/tmp/bg-verify-cursor-pg` |
| `VERIFY_PORT` | `4200` |
| `VERIFY_PG_PORT` | `5433` |
| `VERIFY_WS_PORT` | `5488` |
| `VERIFY_OUT` | `/tmp/verify-platform-cursor-out` |

Port 4200 is the app's `strictPort`. One instance at a time. Launch refuses a port held by a process this skill did not start. Do not drive an instance someone else started.

Optional card entry: `VERIFY_STRIPE_SK=sk_test_… VERIFY_STRIPE_PK=pk_test_… scripts/launch.sh`. Live keys are refused. Never write keys into a file.

Teardown is `scripts/cleanup.sh`. `run.sh` calls it.

## Doctor

```bash
.cursor/skills/verify-platform/scripts/doctor.sh
```

Read-only. Exit 0 means the instance is worth driving. It checks:

- the pid in `$VERIFY_STATE/dev.pid` is alive
- that pid's recorded port is `VERIFY_PORT`
- `GET /` on that port returns 200
- local Postgres accepts the state's password and `drizzle.__drizzle_migrations` has rows
- `apps/platform/.env.verify` points at that local database
- every `features/*.md` file except `README.md` has a `drive.mjs` entry and a README link, and the reverse

Run it whenever a drive looks wrong before editing a recipe.

## Drive

```bash
node .cursor/skills/verify-platform/scripts/drive.mjs --list
node .cursor/skills/verify-platform/scripts/drive.mjs --check-map
node .cursor/skills/verify-platform/scripts/drive.mjs                 # all four
node .cursor/skills/verify-platform/scripts/drive.mjs landing sign-in
```

One fresh browser context per feature, 1280×900. Recipes and selectors live in `features/`. The drive refuses to start when those files and `drive.mjs` disagree.

| feature | entry the drive actually takes | proves |
| --- | --- | --- |
| `landing` | open `/` | 200, title `Fundraising Platform for Nonprofits - Better Giving`, header `Log In` → `/login` |
| `sign-in` | header `Log In` | Google button, email and password, wrong password stays on `/login` with `Invalid email or password` |
| `marketplace` | footer `Marketplace` | heading `Verify Test Nonprofit` |
| `donate` | `Donate` on that card | `+100 USD` → `Continue with Card` → donor fields → summary `Total donation` `$100.00`. Card number only with Stripe test keys |

`/login`, `/marketplace`, and `/donate/<id>` are also visitor entry points. The drive does not take them. Do not report them as verified.

Selectors are accessible names from the UI (`getByRole("button", { name: "+100 USD" })`, placeholder `Email address` where the login fields have no label).

A cold dev server full-reloads the first time the footer scrolls into view, because that prefetches `/donate/1` and Vite optimizes new dependencies. The reload cancels the Marketplace click. `drive.mjs` retries that same click. It does not switch to a direct `goto`.

## Evidence

`$VERIFY_OUT` (default `/tmp/verify-platform-cursor-out`):

- `results.json` — per feature: `feature`, `entry`, `status` (`pass` | `fail` | `unreachable`), facts, error, screenshot paths, ARIA paths, log path
- `<feature>-<step>.png` — full-page screenshot of the action and of the result. On failure, `<feature>-final.png`
- `<feature>-<step>.aria.txt` — ARIA snapshot of `body` at that step
- `<feature>.log` — browser console, page errors, every HTTP status ≥ 400
- `drive.txt`, `launch-doctor.log`, and the server logs copied from the state directory (`dev.log`, `migrate.log`, `packages-build.log`, `stripe-stub.log`)

`unreachable` is not `pass`. Donate card entry is `unreachable` when the payment frame never appears and the only secrets are filler keys.

Exit codes from `drive.mjs` and `run.sh`: `0` all pass, `1` a feature failed, `2` only unreachable, `3` launch, doctor, or proof-preservation failed.

One-shot:

```bash
VERIFY_OUT=/tmp/verify-platform-cursor-out .cursor/skills/verify-platform/scripts/run.sh
VERIFY_OUT=/tmp/verify-platform-cursor-out .cursor/skills/verify-platform/scripts/run.sh landing
```

## Cleanup

```bash
.cursor/skills/verify-platform/scripts/cleanup.sh
```

`run.sh` runs it before launch and on exit. It delegates to `.claude/skills/verify-platform/scripts/cleanup.sh` with this skill's `VERIFY_STATE` and `VERIFY_PG_DIR`. That script signals the dev-server process group recorded in `dev.pid` only when `/proc` start time still matches `dev.starttime`, removes `.env.verify`, and stops and deletes the throwaway Postgres. It does not delete `$VERIFY_OUT`. `KEEP_DB=1` leaves Postgres up for a faster relaunch.

After `run.sh` returns, `results.json` must still be in `$VERIFY_OUT`. A cleanup that removes it fails the run with exit 3.

## Helpers

All paths are from the repo root. Each script is executable except `env.sh`, which the others source.

| script | invocation |
| --- | --- |
| `scripts/env.sh` | sourced; sets the default `VERIFY_*` variables |
| `scripts/launch.sh` | `.cursor/skills/verify-platform/scripts/launch.sh` |
| `scripts/doctor.sh` | `.cursor/skills/verify-platform/scripts/doctor.sh` |
| `scripts/drive.mjs` | `node .cursor/skills/verify-platform/scripts/drive.mjs [feature…]` |
| `scripts/cleanup.sh` | `.cursor/skills/verify-platform/scripts/cleanup.sh` |
| `scripts/run.sh` | `.cursor/skills/verify-platform/scripts/run.sh [feature…]` |

## Maintenance

When routes, labels, or seed data change, update `features/` and `drive.mjs` in the same change. A product regression stays a failing drive; do not edit the check until it passes. The upkeep pass is `maintain-verification-skill`: one source read per feature file, one live drive of every feature, and at most one change set limited to this directory.

## Gotchas

- Filler Stripe keys produce `Express checkout failed to load`, `PayPal failed to load`, and Stripe.js 401s. Those are logged and are not, by themselves, a failed landing, sign-in, or marketplace.
- `COREPACK_HOME` may be an unwritable `/usr/local/share/corepack`. `env.sh` points it at `$HOME/.cache/corepack`.
- This skill and `.claude/skills/verify-platform` share port 4200 and `apps/platform/.env.verify`. Run one at a time. Their state directories differ (`/tmp/bg-verify-cursor` vs `/tmp/bg-verify`).
