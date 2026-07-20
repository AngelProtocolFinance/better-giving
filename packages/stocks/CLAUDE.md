# @better-giving/stocks

Internal package (`private`), a **built** stock ticker + broker-dealer data library. Zero runtime deps. Ships a small typed surface — the US-exchange ticker list and the SEC active broker-dealer name list — consumed by platform's stock donation flow via `workspace:*`. Built with **tsup**; extends `tsconfig.base.json` (tsup owns emit, so the tsconfig stays type-check-only).

## Public API (platform relies on these exact names)

`tickers`, `brokers`, and type `ITicker`. Re-exported from `src/index.ts`.

## Layout

- **`src/`** — hand-written source: `index.ts` (barrel), `types.ts`. These import the committed JSON under `src/generated/`.
- **`src/generated/**`** — `tickers.json`, `brokers.json`, and their `.tickers-meta.json`/`brokers-meta.json` provenance stamps. **Committed source, NOT a build artifact.** Produced occasionally by the `generate-tickers`/`generate-brokers` maintenance scripts (below). Edit only by re-running those scripts; never add to turbo `outputs`.
- **`src/scripts/`** — `env.ts`, `generate-tickers.ts` (Finnhub US symbols), `generate-brokers.ts` (SEC active broker-dealers). The offline maintenance path; NOT in the build, NOT runtime. `node` runs them as ESM via native TS (package.json is `"type": "module"`, so tsup emits `.js`/`.d.ts`).
- **`dist/`** — tsup output (`index.js` + `index.d.ts`). **Gitignored, build artifact.** `exports`/`types` point here.

## Build

`build` = `tsup` (config in `tsup.config.ts`: single entry `src/index.ts`, ESM only, `dts: true`, target es2022) → `dist/index.js` + `dist/index.d.ts`. Runs in `turbo run build`; `outputs` caches `dist/**`. `dependsOn: ["^build"]` — nothing upstream, but the member is built before platform (its consumer).

- **extends `tsconfig.base.json`** — the base is `noEmit`/`module:preserve` and tsup owns emit, so the base policy fits as-is (stocks' tsconfig is type-check-only). Do NOT turn it into an emitting tsconfig; tsup owns emit.
- JSON imports use the standard `with { type: "json" }` attribute; tsup and `node` both handle it. `resolveJsonModule` is on (from base).
- `allowImportingTsExtensions` is on — the `.ts` scripts import siblings with explicit extensions (`./env.ts`) so `node`'s native TS resolution finds them.

## Conventions

- **No pre-commit `type-check` hook** — matches the paypal/crypto precedent (see root `lefthook.yml`/`CLAUDE.md`). Type safety is enforced by the package's build in turbo/CI. After changing `src/`, run `pnpm --filter @better-giving/stocks build` to type-check.
- **Biome** governs the whole member (root `pnpm lint`/`format` run one `biome check .` over the repo; this member's own `lint`/`format` scripts scope to `.`); `dist/` and `src/generated` are excluded in root `biome.json` (the data files are large + machine-generated). Root biome sets `noExplicitAny: off`, matching the source config.
- pin deps exact (repo-wide rule). No `@biomejs/biome` devDep — root provides it.

## maintenance scripts

Offline, occasional; run on **Node 24 native TS** (no bun, no build step — Node strips types + runs the `.ts` directly).

- `pnpm --filter @better-giving/stocks generate-tickers` = `node --env-file=.env ./src/scripts/generate-tickers.ts`. Reads `finnhub_api_key`/`finnhub_base_url` from `.env` (gitignored — not committed; `--env-file` requires it to exist). Fetches US symbols from Finnhub; skips if `.tickers-meta.json` already stamps today. Regenerates `src/generated/tickers.json`.
- `pnpm --filter @better-giving/stocks generate-brokers` = `node ./src/scripts/generate-brokers.ts`. No env needed. Fetches the SEC previous-month active broker-dealer list (utf-16le, tab-delimited), extracts company names. Regenerates `src/generated/brokers.json`.

Regenerate, then commit the updated `src/generated/**`.
