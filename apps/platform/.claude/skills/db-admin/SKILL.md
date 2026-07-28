---
name: db-admin
description: Use when the user asks to update, query, inspect, or fix database records — e.g. "make user X admin", "check donations for Y", "ban user Z", "pg dev/staging/prod"
---

# DB Admin

## Overview

Ad-hoc PostgreSQL operations against the dev/staging or production databases via `psql`.

## When to Use

- User mentions "pg", "db", "database", "sql" with an action
- User asks to change user roles, ban/unban, inspect records
- User references "local", "dev", "staging" or "prod" database

## Connection

One env file per target, each exposing the same key name (`DATABASE_URL`):

| file | target |
|------|--------|
| `.env` | dev — neon `ep-cold-water-aqmhc1lt` |
| `.env.staging` | staging — **same neon branch as dev** (see below) |
| `.env.production` | prod — neon `ep-empty-cherry-aq287pca` |

```bash
# dev
psql "$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')"

# staging
psql "$(grep -m1 '^DATABASE_URL=' .env.staging | cut -d= -f2- | tr -d '"')"

# production — ALWAYS confirm before writes
psql "$(grep -m1 '^DATABASE_URL=' .env.production | cut -d= -f2- | tr -d '"')"
```

**Do not `source` these files, and do not `source <(grep ...)` either.** Every
`DATABASE_URL` value is unquoted and contains `&` (neon appends
`?sslmode=...&channel_binding=...`), so the shell parses it as a background-job
operator and the assignment fails — as do unquoted values with spaces elsewhere
in `.env`. The command-substitution form above sidesteps the shell entirely.

`env "$(grep ...)" psql "$DATABASE_URL"` does **not** work either: the current
shell expands `$DATABASE_URL` before `env` sets it, so psql gets an empty string
and falls back to a local socket ("database `<username>` does not exist").

**dev and staging are currently the same neon branch** — `.env` and
`.env.staging` hold byte-identical `DATABASE_URL` values (verified 2026-07-29).
A migration or backfill "tested on staging" is therefore not isolated from dev,
and dev data is what staging deploys read. Treat them as one environment until
a separate branch exists. There is no localhost postgres.

## Quick Reference

| task | sql |
|------|-----|
| find user | `SELECT id, email, role FROM "user" WHERE email = '...'` |
| set role | `UPDATE "user" SET role = '...' WHERE email = '...' RETURNING id, email, role` |
| ban user | `UPDATE "user" SET banned = true WHERE email = '...' RETURNING id, email, banned` |

Schema files: `.server/pg/schema/` (drizzle). Read the relevant file for column names beyond `user`.

## Migrations

### Env var conventions (migrations)

- **`DATABASE_URL`** → the target for that env file. runtime + `psql` + backfills.
- **`DATABASE_URL_UNPOOLED`** → unpooled connection read by `drizzle.config.ts` (drizzle-kit needs a non-pooled URL for DDL). Present in `.env` and `.env.staging`; **absent from `.env.production`** — running drizzle-kit against prod from a laptop has no configured URL, which is deliberate: prod DDL goes through the deploy, not by hand.
- **`NEON_DATABASE_URL` no longer exists.** It used to hold prod inside `.env`; prod now lives in `.env.production` under `DATABASE_URL`. Backfill scripts that guarded on `DATABASE_URL === NEON_DATABASE_URL` must be re-guarded against the `.env.production` value (still behind an explicit `--prod` flag).

There is no local-postgres target — `wsproxy` / docker-compose has been removed.

### How migrations actually reach each env

`package.json` runs `postbuild: drizzle-kit migrate`, so **every Vercel build applies pending migrations to whatever `DATABASE_URL_UNPOOLED` that environment holds**:

- push to `staging` → staging deploy migrates the dev/staging branch
- merge to `main` → prod deploy migrates prod

Locally, `drizzle-kit generate` produces the committed artifact; `drizzle-kit push` is for fast dev iteration only. Always `generate` so the journal and the artifact CI applies stay in sync.

### Safe migration workflow (multi-phase)

1. **column addition** — add new nullable column only (no FK, no rename, no drop). edit schema → `drizzle-kit push` (against `.env` = neon dev) → `drizzle-kit generate` (migration artifact) → commit to CI
2. **data migration / backfill** — backfill new column from old, clean orphan rows. run against dev first, then prod (`--prod` flag + the `.env.production` `DATABASE_URL`)
3. **code changes + schema enforcement** — separate branch/PR: rename refs in codebase, add FK constraints, drop old column. verify on neon dev + preview CI, then merge

### Notes

- dev uses `drizzle-kit push` (not migrate) — but migration journal must stay in sync; always also run `drizzle-kit generate` to produce the artifact CI will apply to prod
- when testing a new migration, run `drizzle-kit migrate` against neon dev first. `drizzle.config.ts` reads `DATABASE_URL_UNPOOLED` from the process env, and the same quoting hazard applies — pass it inline:
  ```bash
  DATABASE_URL_UNPOOLED="$(grep -m1 '^DATABASE_URL_UNPOOLED=' .env | cut -d= -f2- | tr -d '"')" pnpm exec drizzle-kit migrate
  ```
- if the migration runner fails silently, run the `.sql` file directly via `psql -f` to see the actual error
- **data migrations**: run against neon dev first to catch constraint violations (e.g. check constraints on rows with null new-columns), then prod with explicit prod-ack flag

## Rules

1. Quote reserved-word identifiers (`"user"`, `"order"`, etc.)
2. Always `RETURNING` on mutations
3. **Production writes**: show SQL, wait for explicit user approval before executing
4. Look up schema in `.server/pg/schema/` when unsure of columns
5. **Migration config**: `drizzle.config.ts` reads `DATABASE_URL_UNPOOLED` from the process env — whichever env file you fed it. Default (nothing exported) is `.env` = dev.
6. **Name the target before you run.** All three files use the key `DATABASE_URL`, so the filename is the only thing distinguishing dev from prod. State which file a command reads before executing it.
