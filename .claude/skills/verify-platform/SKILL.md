---
name: verify-platform
description: Drive apps/platform (the Better Giving web app) in a real headless browser the way a user does — home, sign-in, marketplace, the donate form through to the Stripe payment step — and return proof (pass/fail/blocked per flow, screenshots, logs). Use after any change to platform UI, routes, loaders, db queries or the donation flow, before reporting a build done. This is NOT the lint/typecheck `verify` skill; run that too.
---

# verify-platform

Boots `apps/platform` locally against a throwaway Postgres with **only
committed filler secrets** (`apps/platform/.env.test`), drives it with
Playwright/Chromium, and writes evidence. Nothing here talks to Neon, Vercel,
or production; `neon-local.mjs` refuses a non-localhost `DATABASE_URL`.

## TL;DR

```bash
export PATH=~/.local/node24/bin:$PATH
VERIFY_OUT=/tmp/verify-$(date +%s) .claude/skills/verify-platform/scripts/run.sh            # all flows
VERIFY_OUT=... .claude/skills/verify-platform/scripts/run.sh home donate-card               # some flows
node .claude/skills/verify-platform/scripts/drive.mjs --list                                # flow list
```

Exit: `0` all pass · `1` a flow failed · `2` only blocked flows (need secrets) · `3` launch/doctor failed.
Report `results.json` + screenshot paths verbatim. `blocked` is **not** `pass`.

## Launch

`scripts/launch.sh` (run.sh calls it). It:
1. `pg-up.sh` — initdb/start Postgres at `127.0.0.1:5433`, db `app`, data `/tmp/bg-verify-pg` (needs `apt install postgresql`; `sudo` works on the box). No trust auth and no unix socket: TCP on 127.0.0.1 only, scram-sha-256 with a random per-cluster password (`$VERIFY_STATE/pg.pass`, 0600). It writes a `.verify-platform-owned` marker into the data dir and refuses to reuse an existing dir without one.
2. writes `apps/platform/.env.verify` (gitignored, 0600): `.env.test` + local `DATABASE_URL` (with that password) + `BASE_URL=http://127.0.0.1:4200`. Started with `--mode verify`, and mode files beat `.env`, so a developer's real `.env` never applies.
3. builds `packages/*` (platform imports their `dist/`).
4. migrates with the repo's own `.server/pg/migrate.ts`, seeds `scripts/seed.sql` (npo `Verify Test Nonprofit`, USD rates).
5. `react-router dev --mode verify --host 127.0.0.1 --port 4200` with `NODE_OPTIONS="--import neon-local.mjs --import stripe-stub.mjs"`.
Ready = `GET /` → 200 (first SSR compile takes ~10–60 s). State in `/tmp/bg-verify` (`dev.pid`, `port`, `npo_id`, `pg.pass`, `dev.log`, `stripe-stub.log`). The state dir must be private: launch.sh/pg-up.sh create it `0700`, and refuse an existing one that is a symlink, not owned by you, or not `0700` (another local user could pre-plant the fixed `/tmp` path); `pg.pass` is never written through a symlink (`scripts/lib.sh`). On a refusal, remove the dir or set `VERIFY_STATE` to a fresh path.

Preloads (verification scaffolding — **no product code is changed**):
- `neon-local.mjs`: points the `@neondatabase/serverless` driver at local Postgres — HTTP queries via `fetchFunction` run through `pg`; transactions go over a ws→tcp pipe on `:5488`, which only dials `DATABASE_URL`'s own port and refuses any request carrying an `Origin` header (i.e. any browser).
- `stripe-stub.mjs`: while `STRIPE_SECRET_KEY` is filler, server-side `api.stripe.com` calls hit an in-process stub: `GET /v1/country_specs/:cc` is answered, everything else gets a Stripe-shaped 400 and is logged. With real test keys it is inert.

Full card flow: `VERIFY_STRIPE_SK=sk_test_… VERIFY_STRIPE_PK=pk_test_… scripts/run.sh donate-card` (live keys are refused). Never paste keys into files.

Env knobs: `VERIFY_PORT` (4200), `VERIFY_PG_PORT` (5433), `VERIFY_WS_PORT` (5488), `VERIFY_STATE`, `VERIFY_OUT`, `KEEP_DB=1` (cleanup leaves Postgres up for a faster relaunch).

## Doctor

`scripts/doctor.sh` — read-only; exit 0 = worth driving. Checks: dev server pid from launch.sh alive, `GET /` 200, local Postgres reachable with migrations applied, `.env.verify` points at the local db. Run it first whenever anything looks off.

## Isolation

One instance per box at a time on the default ports (4200 is the app's `strictPort`). launch.sh refuses if :4200 is held by something it didn't start; set `VERIFY_PORT`, `VERIFY_PG_PORT`, `VERIFY_WS_PORT`, `VERIFY_STATE`, `VERIFY_PG_DIR` to run a second one. Don't drive an instance someone else started.

## Drive

`scripts/drive.mjs [flow…]` — one fresh browser context per flow, 1280×900. Flows (details in `features/`):

| flow | proves |
|---|---|
| `home` | `/` 200, title is "Fundraising Platform for Nonprofits - Better Giving", header login link resolves to `/login` |
| `login` | `/login` renders Google + email/password; wrong password → "Invalid email or password", stays on /login (better-auth + db) |
| `marketplace` | seeded npo card listed (db read path) |
| `donate-card` | `/donate/:id` → +100 USD → Continue with Card → donor info → payment step with summary $100.00; with real test keys, types 4242… into the Stripe Payment Element (`donate-card-4-card.png`) |
| `smoke-paths` | smoke.yml's `/`, `/api/currencies`, `/form-embed.js` < 400 locally |

Selectors are ARIA/text/`name=` handles from the real UI (`getByRole("button", {name: "+100 USD"})`, `input[name="email"]`, …). Add a flow by adding an entry to `FLOWS` in drive.mjs **and** a file in `features/`.

## Evidence

`$VERIFY_OUT/`: `results.json` (per flow: status pass|fail|blocked, observed facts, error, screenshots, log), `<flow>[-step].png` full-page screenshots of each step (on failure `<flow>-final.png`), `<flow>.log` (browser console, page errors, every HTTP ≥400), `drive.txt`, `launch-doctor.log`, and every server log from the state dir (`dev.log`, `migrate.log`, `packages-build.log`, `stripe-stub.log` — what was faked). The logs are copied on every exit, ^C and kill included, before cleanup deletes the state dir.

Proof standards: the real user path only (clicks/typing, no test endpoints); capture each step, not just the end; check side effects (db-backed text on screen, stub log); a flow that can't run for want of secrets is `blocked` with the reason, never `pass`. Read the screenshots before claiming success.

## Cleanup

`scripts/cleanup.sh` (run.sh calls it before launch, and on every exit — including ^C/kill — via a trap): kills the dev server **process group from `dev.pid`** (never by name), removes `.env.verify`, stops and deletes the throwaway Postgres (`KEEP_DB=1` keeps it), removes `/tmp/bg-verify`. Never touches `$VERIFY_OUT`. It deletes `VERIFY_PG_DIR` only if pg-up.sh's `.verify-platform-owned` marker is in it, and exits 1 leaving the dir intact when the marker is missing or a running Postgres won't stop; run.sh then aborts with 3 before launching.

## Tests

For changes to these scripts: `tests/test-pg-pass-symlink.sh` (state-dir and `pg.pass` refusals; fast, uses `sudo -n` for the foreign-owner case) and `tests/test-sigint-logs.sh [INT|TERM]` (a real run on spare ports, interrupted mid-drive; checks the logs reached `VERIFY_OUT` and everything stopped).

## Gotchas

- Don't wait for `networkidle`: Stripe.js/analytics keep retrying. Wait on a visible element.
- With filler keys the browser shows "Express checkout failed to load" / "PayPal failed to load" and Stripe.js 401s — expected, logged, not a failure of these flows.
- `COREPACK_HOME` defaults to an unwritable `/usr/local/share/corepack` on the box; launch.sh sets `$HOME/.cache/corepack`.
- First run downloads nothing but needs `pnpm exec playwright install chromium` once (done on the box).
- Maintain: when a flow breaks because the UI changed (not a regression), fix drive.mjs + its feature file in the same change; when it's a product regression, report it — don't edit the check to pass.
