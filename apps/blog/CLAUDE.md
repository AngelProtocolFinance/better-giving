# blog (Sanity Studio)

Pure Sanity Studio. Content source for the `better-giving` web app's `/blog`.

## Commands

workspace member `blog` in the better-giving monorepo; run from
repo root (turbo delegates) or scope with `--filter`:

- `pnpm dev:blog` (root) or `pnpm --filter blog dev` — local studio at http://localhost:3333
- `pnpm build` (root, whole graph) or `pnpm --filter blog build` — production build (outputs to `apps/blog/dist`)
- `pnpm --filter blog schema` — extract schema → `schema.json` (SLOW, re-bundles studio)
- `pnpm --filter blog typegen` — regen `types.ts` + copy `queries.ts` into `blog-types` (FAST, offline)

## AFTER YOU EDIT (required)

there is NO drift guard in lefthook — stale types ship silently if you skip
this. so whenever you change:

- **`schemaTypes/`** (document shape) → run `pnpm --filter blog schema && pnpm --filter blog typegen`
  (re-extracts `schema.json`, then regens types from it).
- **`queries.ts`** (groq only, no schema change) → run `pnpm --filter blog typegen`
  (regens `types.ts` + copies queries into `blog-types`).

Then stage the regenerated `blog-types` artifacts (`packages/types/blog/{types.ts,queries.ts}`
and `apps/blog/schema.json`) alongside your edit. platform consumes `blog-types`, so
forgetting this means platform builds against stale types.

Publishing the studio is NOT part of this step. It is hosted on Vercel (project
`better-giving-blog`, see `README.md` → Deploy), which rebuilds it from `main`, so a
schema change reaches editors when it lands on `main`. Never run `sanity deploy`:
it creates a second, Sanity-hosted copy at `<hostname>.sanity.studio`.

## Project

- org: `oQxcQWCVV`
- projectId + dataset live in three places that change together — nothing checks they agree:
  `sanity.config.ts` (the studio), `sanity.cli.ts` (`api`, read by the CLI),
  and `packages/types/blog/project.ts` (the copy platform reads)
- manage: https://www.sanity.io/manage/project/5820hdyj

## Schema

Document types live in `schemaTypes/` and are registered in
`schemaTypes/index.ts`.
