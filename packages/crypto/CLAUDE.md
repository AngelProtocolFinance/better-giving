# @better-giving/crypto

Internal package (`private`), a **built** crypto token + chain data library. Zero runtime deps. Ships a small typed surface — the supported-token list, a code→token map, chain metadata, and the `is_custom` predicate — consumed by platform's crypto donation flow via `workspace:*`. Built with **tsup** (not raw tsc), so unlike `@better-giving/paypal-sdk` it **extends `tsconfig.base.json`** and is NOT a base-exception.

## Public API (platform relies on these exact names)

`tokens_list`, `is_custom`, `tokens_map`, `chains`, and types `IToken`, `ITokensMap`, `IChainsMap`, `IRawToken`, `IChainInfo`, `IRawTokensRes`, `TEnsure`. Re-exported from `src/index.ts`.

## Layout

- **`src/`** — hand-written source: `index.ts` (barrel), `types.ts`, `chains.ts`, `tokens/{list.ts,map.ts}`. These import the committed JSON under `src/generated/`.
- **`src/generated/**`** — `chains.json`, `symbols.json`, `tokens/{hash,list,map}.json`. **Committed source, NOT a build artifact.** Produced occasionally by the `generate-tokens` maintenance script (below). Edit only by re-running that script; never add to turbo `outputs`.
- **`src/scripts/`** — `generate-tokens.mts` + `{custom,env,helpers}.mts`. The offline maintenance path; NOT in the build, NOT runtime. `.mts` (not `.ts`) so `node` runs them as ESM without a package-type warning (package.json has no `"type"` — kept off so tsup emits `.mjs`).
- **`dist/`** — tsup output (`index.mjs` + `index.d.mts`). **Gitignored, build artifact.** `exports`/`types` point here.

## Build

`build` = `tsup` (config in `tsup.config.ts`: single entry `src/index.ts`, ESM only, `dts: true`, target es2022) → `dist/index.mjs` + `dist/index.d.mts`. Runs in `turbo run build`; `outputs` caches `dist/**`. `dependsOn: ["^build"]` — nothing upstream, but the member is built before platform (its consumer).

- **extends `tsconfig.base.json`** — the base is `noEmit`/`module:preserve` and tsup owns emit, so the base policy fits as-is (crypto's tsconfig is type-check-only). Do NOT turn it into a standalone emitting tsconfig; that's the paypal-sdk-specific pattern (it emits via raw tsc).
- JSON imports use the standard `with { type: "json" }` attribute (both in `src/` and the `.mts` scripts); tsup and `node` both handle it. `resolveJsonModule` is on (from base).
- `allowImportingTsExtensions` is on — the `.mts` scripts import siblings with explicit extensions (`./helpers.mts`) so `node`'s native TS resolution finds them.

## Conventions

- **No pre-commit `type-check` hook** — matches the paypal-sdk precedent (see root `lefthook.yml`/`CLAUDE.md`). Type safety is enforced by the package's build in turbo/CI. crypto's `src/` imports committed JSON (present pre-commit, so a hook *could* work) but consistency with the established built-member convention wins. After changing `src/`, run `pnpm --filter @better-giving/crypto build` to type-check.
- **Biome** governs `src/` only (`lint`/`format` scripts scope to it); `dist/` and `src/generated/tokens` are excluded in root `biome.json`. Root biome sets `noExplicitAny: off`, matching the source config.
- pin deps exact (repo-wide rule). No `@biomejs/biome` devDep — root provides it.

## `generate-tokens` maintenance script

`pnpm --filter @better-giving/crypto generate-tokens` = `node --env-file=.env ./src/scripts/generate-tokens.mts`. Offline, occasional; runs on **Node 24 native TS** (no bun, no build step — Node strips types + runs the `.mts` directly). Reads `api_base_url` from `.env` (gitignored — not committed; `--env-file` requires it to exist). Fetches from the API and dedups within the run via an in-memory `keyv` (the only script devDep). No cross-run persistence by design — a fresh list each run is how new chains/symbols get detected. Regenerates `src/generated/**`, which you then commit.
