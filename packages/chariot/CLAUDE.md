# @better-giving/chariot

Internal package (`private`), a **built** server-side Chariot SDK. Ships the `Chariot` class — a thin typed wrapper over the Chariot DAF REST API (grant get/create) — plus the request/response types generated from Chariot's OpenAPI spec. Consumed by platform's DAF grant path via `workspace:*` — imported as `@better-giving/chariot`.

## Public API (platform relies on these exact names)

`Chariot` (class) + types `Grant`, `CreateGrantRequest`, `ISdkConfig`. Re-exported from `src/index.ts`. `Chariot` is constructed with `ISdkConfig` = `{ api_key, api_url }`.

## Layout

- **`src/`** — hand-written source: `index.ts` (barrel), `sdk.ts` (the `Chariot` class), `interfaces.ts` (curated path constants + type aliases over the generated types).
- **`src/generated/**`** — `openapi-typescript` output (`chariot.ts` + barrel). **Committed source, NOT a build artifact.** Refreshed only by the `generate` script (below); never add to turbo `outputs`.
- **`specs/chariot.yaml`** — committed OpenAPI spec, the input to `generate`. Chariot has no download step (unlike paypal), so the spec is vendored here as committed source, not gitignored.
- **`dist/`** — `tsc` output (`index.js` + `.d.ts`). **Gitignored, build artifact.** `exports` points here.

## Build

`build` = `tsc` (per `tsconfig.json`) → `dist/`. Generated types are committed, so the build is compile-only (hermetic — no network). Runs in `turbo run build`; `outputs` caches `dist/**`, and it's built before platform (its consumer).

- **`tsconfig.json` extends `tsconfig.base.json`** and adds the emit config raw `tsc` needs (see the tsconfig comments). Same built-member pattern as paypal, which also emits via tsc.
- **No pre-commit `type-check` hook** — matches the established built-member convention (see paypal/crypto). Type safety is enforced by the package's build in turbo/CI. After changing `src/`, run `pnpm --filter @better-giving/chariot build`.

## Conventions

- **Biome** governs the whole member via the root `biome.json` (one repo pass); `dist/` and `src/generated` are excluded there. Member `lint`/`format` scripts scope to `.` for granular `--filter` runs.
- pin deps exact (repo-wide rule); shared `typescript`/`@types/node` via `catalog:`. No `@biomejs/biome` devDep — root provides it.

## `generate` maintenance script

`pnpm --filter @better-giving/chariot generate` = `tsx scripts/generate-types.ts` (`openapi-typescript` over `specs/chariot.yaml` → `src/generated/**`). Offline/occasional; regenerates the committed `src/generated`, which you then commit. To refresh the API surface, replace `specs/chariot.yaml` with the latest Chariot OpenAPI spec and re-run.
