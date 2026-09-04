# blog (Sanity Studio)

Pure Sanity Studio. Content source for the `better-giving` web app's `/blog`.

## Commands

workspace member `blog` in the better-giving monorepo; run from
repo root (turbo delegates) or scope with `--filter`:

- `pnpm dev:blog` (root) or `pnpm --filter blog dev` — local studio at http://localhost:3333
- `pnpm build` (root, whole graph) or `pnpm --filter blog build` — production build (outputs to `apps/blog/dist`)
- `pnpm --filter blog schema` — extract schema → `schema.json` (SLOW, re-bundles studio)
- `pnpm --filter blog typegen` — regen `types.ts` + copy `queries.ts` into `blog-types` (FAST, offline)
- `pnpm --filter blog deploy` — `schema` + `typegen` + `sanity deploy` (push hosted studio)

## AFTER YOU EDIT (required)

there is NO drift guard in lefthook — stale types ship silently if you skip
this. so whenever you change:

- **`schemaTypes/`** (document shape) → run `pnpm --filter blog deploy`
  (regens types AND pushes the hosted studio so live schema matches).
- **`queries.ts`** (groq only, no schema change) → run `pnpm --filter blog typegen`
  (regens `types.ts` + copies queries into `blog-types`; no deploy needed).

Then stage the regenerated `blog-types` artifacts (`packages/types/blog/{types.ts,queries.ts}`
and `apps/blog/schema.json`) alongside your edit. platform consumes `blog-types`, so
forgetting this means platform builds against stale types.

## Project

- projectId: `5820hdyj`
- dataset: `production`
- org: `oQxcQWCVV`
- manage: https://www.sanity.io/manage/project/5820hdyj

## Schema

Document types live in `schemaTypes/` and are registered in
`schemaTypes/index.ts`. Current types: `post`.
