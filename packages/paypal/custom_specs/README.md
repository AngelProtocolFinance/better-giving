# Custom OpenAPI Specifications

OpenAPI specifications PayPal does not publish in its [official specifications repository](https://github.com/paypal/paypal-rest-api-specifications), vendored here and versioned by directory (`v1/`, `v2/`).

## Adding Custom Specs

1. Add the specification JSON to its version directory
2. Give it a friendly module name in `MODULE_NAMES` (`scripts/generate-types.ts`). Without one, the generated module is named after the file
3. Run `pnpm --filter @better-giving/paypal generate`, then commit the regenerated `src/generated/**`

`build` is compile-only and never regenerates types, so a spec added without a `generate` run ships nothing.

## Current Custom Specs

### Payments API v1 (`payments_v1.json`)

Deprecated by PayPal. It stays because it is the source of the `Sale` type; new integrations use the Checkout Orders API v2 or Payments API v2.

## Specs and version control

`scripts/download-specs.ts` copies this directory into `specs/` alongside the official specs it fetches. Custom specs are committed; `specs/` is gitignored, so anything that lands there by download is disposable.
