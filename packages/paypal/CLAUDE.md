# @better-giving/paypal

Internal package (`private`), a **built** server-side PayPal SDK. Ships the `PayPalSDK` class — a thin typed wrapper over PayPal's REST APIs (OAuth token caching + orders / billing plans / subscriptions) — plus the request/response types generated from PayPal's OpenAPI specs. Consumed by platform's donation + webhook money paths via `workspace:*` — imported as `@better-giving/paypal`.

## Public API (platform relies on these exact names)

`PayPalSDK` (class) + types `Capture`, `Order`, `Sale`, `Subs`, `WebhookEvent`, `PurchaseUnitsRequest` (and the full request/response set). Re-exported from `src/index.ts`. `PayPalSDK` is constructed with `ISdkConfig` = `{ client_id, client_secret, api_url }`.

## Layout

- **`src/`** — hand-written source: `index.ts` (barrel), `sdk.ts` (the `PayPalSDK` class), `interfaces.ts` (curated path constants + type aliases over the generated types).
- **`src/generated/**`** — `openapi-typescript` output (`orders`, `payments`, `payments-v1`, `subscriptions`, `catalog-products`, `webhooks` + barrel). **Committed source, NOT a build artifact.** Refreshed only by the `generate` script (below); never add to turbo `outputs`.
- **`custom_specs/v1/payments_v1.json`** — committed OpenAPI spec for the legacy Payments v1 API (source of the `Sale` type); PayPal doesn't publish it, so it's vendored here and copied into `specs/` by `download-specs`.
- **`dist/`** — `tsc` output (`index.js` + `.d.ts`). **Gitignored, build artifact.** `exports` points here.
- **`specs/`** — downloaded/copied OpenAPI specs. **Gitignored**, an input to `generate` only.

## Build

`build` = `tsc` (per `tsconfig.json`) → `dist/`. Generated types are committed, so the build is compile-only (hermetic — no network). Runs in `turbo run build`; `outputs` caches `dist/**`, and it's built before platform (its consumer).

- **`tsconfig.json` extends `tsconfig.base.json`** and adds the emit config raw `tsc` needs (see the tsconfig comments). Same built-member pattern as crypto, which emits via tsup instead.
- **No pre-commit `type-check` hook** — matches the established built-member convention (see crypto). Type safety is enforced by the package's build in turbo/CI. After changing `src/`, run `pnpm --filter @better-giving/paypal build`.

## Conventions

- **Biome** governs the whole member via the root `biome.json` (one repo pass); `dist/`, `specs/`, and `src/generated` are excluded there. Member `lint`/`format` scripts scope to `.` for granular `--filter` runs.
- pin deps exact (repo-wide rule). No `catalog:` here (deliberate — kept on its own pinned `typescript`/`@types/node`); no `@biomejs/biome` devDep — root provides it.

## `generate` maintenance script

`pnpm --filter @better-giving/paypal generate` = `download-specs` (fetch official PayPal specs → `specs/`, copy `custom_specs/**` in) then `generate-types` (`openapi-typescript` → `src/generated/**`). Offline/occasional; regenerates the committed `src/generated`, which you then commit. Edit `scripts/download-specs.ts`'s `SPEC_FILES` to add an API surface.
