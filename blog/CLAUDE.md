# blog (Sanity Studio)

Pure Sanity Studio. Content source for the `better-giving` web app's `/blog`.

## Commands

workspace member `blog` in the better-giving monorepo; run from
repo root (turbo delegates) or scope with `--filter`:

- `pnpm dev:blog` (root) or `pnpm --filter blog dev` — local studio at http://localhost:3333
- `pnpm build` (root, whole graph) or `pnpm --filter blog build` — production build (outputs to `blog/dist`)
- `pnpm --filter blog exec sanity deploy` — deploy hosted studio to `<hostname>.sanity.studio`

## Project

- projectId: `5820hdyj`
- dataset: `production`
- org: `oQxcQWCVV`
- manage: https://www.sanity.io/manage/project/5820hdyj

## AI

Sanity Claude Code plugin (`sanity@claude-plugins-official`) is installed
user-globally — provides the Sanity MCP server (`query_documents`,
`create_documents`, `edit_document`, `deploy_schema`, etc.) and skills
(`sanity:sanity-best-practices`, `sanity:content-modeling-best-practices`,
`sanity:deploy-schema`, `sanity:typegen`, ...).

## Schema

Document types live in `schemaTypes/` and are registered in
`schemaTypes/index.ts`. Current types: `post`.
