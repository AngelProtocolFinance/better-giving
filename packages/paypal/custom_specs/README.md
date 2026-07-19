# Custom OpenAPI Specifications

This directory contains custom OpenAPI specifications that are not available in the official PayPal REST API specifications repository.

## Directory Structure

Custom specs are organized by version:

```
custom_specs/
├── v1/
│   └── payments_v1.json
└── README.md
```

## Adding Custom Specs

To add a new custom specification:

1. Create or update a version directory (e.g., `v1/`, `v2/`)
2. Add your OpenAPI specification JSON file to the version directory
3. Update the `MODULE_NAMES` mapping in `scripts/generate-types.ts` to provide a friendly name for your spec
4. Run `pnpm build` to generate TypeScript types

## Current Custom Specs

### Payments API v1 (`payments_v1.json`)

The PayPal Payments API v1 is a legacy API that provides functionality for:

- Creating and managing payments (sale, authorize, order)
- Executing approved PayPal payments
- Managing sales (show details, refund)
- Authorization operations (capture, void, reauthorize)
- Capture and refund operations

**Note:** This API is deprecated by PayPal. For new integrations, use the Checkout Orders API v2 or Payments API v2.

**Generated module:** `payments_v1` (accessible via `@better-giving/paypal/generated`)

## Build Process

The build process automatically:

1. Downloads official specs from PayPal's GitHub repository (`scripts/download-specs.ts`)
2. Copies custom specs from this directory to the `specs/` folder
3. Generates TypeScript types from all specs (`scripts/generate-types.ts`)
4. Compiles the TypeScript code

Custom specs are committed to version control, while downloaded specs are ignored (see `.gitignore`).
