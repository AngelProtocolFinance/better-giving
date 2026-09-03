# PayPal TypeScript Types

TypeScript type definitions automatically generated from [PayPal's official OpenAPI specifications](https://github.com/paypal/paypal-rest-api-specifications).

## Modules

`@better-giving/paypal` exports the `PayPalSDK` class and the curated helper types.
`@better-giving/paypal/generated` exports one namespace per PayPal API: the shipped set is the
export list in `src/generated/index.ts`, and the specs it is generated from are `SPEC_FILES` in
`scripts/download-specs.ts`.

`payments_v1` is PayPal's legacy Payments API and is deprecated by PayPal. New work belongs on
Orders v2 or Payments v2.

## Usage

```typescript
// Import helper types and utilities from the main package
import type {
  CreateOrderRequest,
  CreateOrderResponse,
  Order,
  PurchaseUnitsRequest
} from '@better-giving/paypal';

// Or import raw generated types from specific API modules
import { orders, payments, subscriptions } from '@better-giving/paypal/generated';

type OrderDetail = typeof orders.components.schemas.order;
type PaymentCapture = typeof payments.components.schemas['capture-2'];
```

## Using the PayPal SDK Helper

```typescript
import { PayPalSDK, type ISdkConfig } from '@better-giving/paypal';

const sdk = new PayPalSDK({
  client_id: 'your-client-id',
  client_secret: 'your-client-secret',
  api_url: 'https://api-m.sandbox.paypal.com', // or https://api-m.paypal.com for production
});

// Create an order
const order = await sdk.create_order({
  intent: 'CAPTURE',
  purchase_units: [
    {
      amount: {
        currency_code: 'USD',
        value: '100.00',
      },
    },
  ],
});
```

## Development

### Building from Source

```bash
corepack enable
pnpm install
pnpm --filter @better-giving/paypal build
```

Scripts live in `package.json`.

## Updating Types

To update the types when PayPal releases new API specifications, regenerate the committed `src/generated/**` (then commit it):

```bash
pnpm --filter @better-giving/paypal generate
```

## Type Structure

Each module is `openapi-typescript` output; read the module file for the exact shape.

## Related Links

- [PayPal REST API Specifications](https://github.com/paypal/paypal-rest-api-specifications)
- [PayPal Developer Documentation](https://developer.paypal.com/docs/api/)
- [openapi-typescript](https://github.com/drwpow/openapi-typescript)
