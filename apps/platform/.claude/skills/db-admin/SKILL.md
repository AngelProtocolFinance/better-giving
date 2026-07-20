---
name: db-admin
description: Use when the user asks to update, query, inspect, or fix database records — e.g. "make user X admin", "check donations for Y", "ban user Z", "pg local/prod"
---

# DB Admin

## Overview

Ad-hoc PostgreSQL operations against local or production databases via `psql`.

## When to Use

- User mentions "pg", "db", "database", "sql" with an action
- User asks to change user roles, ban/unban, inspect records
- User references "local" or "prod" database

## Connection

```bash
# dev (neon dev branch) — .env has shell-unfriendly lines, use source <(grep ...) instead of source .env
source <(grep '^DATABASE_URL=' .env) && psql "$DATABASE_URL"

# production (neon prod) — ALWAYS confirm before writes
export $(grep '^NEON_DATABASE_URL=' .env) && psql "$NEON_DATABASE_URL"
```

`DATABASE_URL` is the neon dev branch; there is no localhost postgres. `NEON_DATABASE_URL` is prod.

## Quick Reference

| task | sql |
|------|-----|
| find user | `SELECT id, email, role FROM "user" WHERE email = '...'` |
| set role | `UPDATE "user" SET role = '...' WHERE email = '...' RETURNING id, email, role` |
| ban user | `UPDATE "user" SET banned = true WHERE email = '...' RETURNING id, email, banned` |

Schema files: `.server/pg/schema/` (drizzle). Read the relevant file for column names beyond `user`.

## Migrations

### Env var conventions (migrations)

- **`DATABASE_URL`** → neon **dev** branch. non-prod. safe target for `drizzle-kit push` and backfill dry/live runs.
- **`NEON_DATABASE_URL`** → **prod**. only target after dev verification + merge. backfill scripts must guard on this (refuse to write unless an explicit `--prod` flag is passed and `DATABASE_URL === NEON_DATABASE_URL`).
- **`DATABASE_URL_UNPOOLED`** → unpooled connection used by `drizzle.config.ts` (drizzle-kit needs a non-pooled URL for DDL). points at the same target as `DATABASE_URL`.

There is no local-postgres target anymore — "local" === neon dev branch. `wsproxy` / docker-compose has been removed.

### Safe migration workflow (multi-phase)

1. **column addition** — add new nullable column only (no FK, no rename, no drop). edit schema → `drizzle-kit push` (against `DATABASE_URL` = neon dev) → `drizzle-kit generate` (migration artifact) → commit to CI
2. **data migration / backfill** — backfill new column from old, clean orphan rows. run against neon dev first, then prod (`DATABASE_URL=$NEON_DATABASE_URL … --prod`)
3. **code changes + schema enforcement** — separate branch/PR: rename refs in codebase, add FK constraints, drop old column. verify on neon dev + preview CI, then merge

### Notes

- dev uses `drizzle-kit push` (not migrate) — but migration journal must stay in sync; always also run `drizzle-kit generate` to produce the artifact CI will apply to prod
- when testing a new migration, run `drizzle-kit migrate` against neon dev first
- if the migration runner fails silently, run the `.sql` file directly via `psql -f` to see the actual error
- **data migrations**: run against neon dev first to catch constraint violations (e.g. check constraints on rows with null new-columns), then prod with explicit prod-ack flag

## Rules

1. Quote reserved-word identifiers (`"user"`, `"order"`, etc.)
2. Always `RETURNING` on mutations
3. **Production writes**: show SQL, wait for explicit user approval before executing
4. Look up schema in `.server/pg/schema/` when unsure of columns
5. **Migration config**: `drizzle.config.ts` uses `DATABASE_URL_UNPOOLED` (neon dev branch, unpooled). prod connection is `NEON_DATABASE_URL`. `DATABASE_URL` is the runtime + dev target — never prod.
