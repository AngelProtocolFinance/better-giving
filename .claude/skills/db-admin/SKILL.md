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
# local — .env has shell-unfriendly lines, use source <(grep ...) instead of source .env
source <(grep '^DATABASE_URL=' .env) && psql "$DATABASE_URL"

# production — ALWAYS confirm before writes
export $(grep '^NEON_DATABASE_URL=' .env) && psql "$NEON_DATABASE_URL"
```

## Quick Reference

| task | sql |
|------|-----|
| find user | `SELECT id, email, role FROM "user" WHERE email = '...'` |
| set role | `UPDATE "user" SET role = '...' WHERE email = '...' RETURNING id, email, role` |
| ban user | `UPDATE "user" SET banned = true WHERE email = '...' RETURNING id, email, banned` |

Schema files: `.server/pg/schema/` (drizzle). Read the relevant file for column names beyond `user`.

## Migrations

### Safe migration workflow (multi-phase)

1. **column addition** — add new nullable column only (no FK, no rename, no drop). edit schema → `drizzle-kit push` (local) → `drizzle-kit generate` (migration artifact) → commit to CI
2. **data migration / backfill** — backfill new column from old, clean orphan rows. run against local first, then prod
3. **code changes + schema enforcement** — separate branch/PR: rename refs in codebase, add FK constraints, drop old column. run locally, verify in preview CI (neon branch should pass), then merge

### Notes

- local uses `drizzle-kit push` (not migrate) for dev — but migration journal must stay in sync
- when testing a new migration, run `drizzle-kit migrate` against local first
- if local migration runner fails silently, run the `.sql` file directly via `psql -f` to see the actual error
- **data migrations**: run against local first to catch constraint violations (e.g. check constraints on rows with null new-columns), then prod

## Rules

1. Quote reserved-word identifiers (`"user"`, `"order"`, etc.)
2. Always `RETURNING` on mutations
3. **Production writes**: show SQL, wait for explicit user approval before executing
4. Look up schema in `.server/pg/schema/` when unsure of columns
5. **Migration config**: `drizzle.config.ts` uses `DATABASE_URL_UNPOOLED`, prod connection is `NEON_DATABASE_URL`
