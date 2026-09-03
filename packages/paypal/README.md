# PayPal TypeScript Types

TypeScript type definitions automatically generated from [PayPal's official OpenAPI specifications](https://github.com/paypal/paypal-rest-api-specifications).

## Available Modules

| Module | Import Path | API |
|--------|-------------|-----|
| **Orders** | `@better-giving/paypal/generated` (`orders`) | Checkout Orders API v2 |
| **Payments** | `@better-giving/paypal/generated` (`payments`) | Payments API v2 |
| **Payments v1** | `@better-giving/paypal/generated` (`payments_v1`) | Payments API v1 (Legacy) |
| **Subscriptions** | `@better-giving/paypal/generated` (`subscriptions`) | Billing Subscriptions API v1 |
| **Invoices** | `@better-giving/paypal/generated` (`invoices`) | Invoicing API v2 |
| **Payouts** | `@better-giving/paypal/generated` (`payouts`) | Payouts Batch API v1 |
| **Payment Tokens** | `@better-giving/paypal/generated` (`payment_tokens`) | Vault Payment Tokens API v3 |
| **Disputes** | `@better-giving/paypal/generated` (`disputes`) | Customer Disputes API v1 |
| **Partner Referrals** | `@better-giving/paypal/generated` (`partner_referrals`) | Partner Referrals API v2 |
| **Catalog Products** | `@better-giving/paypal/generated` (`catalog_products`) | Catalog Products API v1 |
| **Shipment Tracking** | `@better-giving/paypal/generated` (`shipment_tracking`) | Shipment Tracking API v1 |
| **Web Experience Profiles** | `@better-giving/paypal/generated` (`web_experience_profiles`) | Payment Experience API v1 |
| **Transaction Search** | `@better-giving/paypal/generated` (`transaction_search`) | Transaction Search API v1 |
| **Webhooks** | `@better-giving/paypal/generated` (`webhooks`) | Webhooks Management API v1 |
| **SDK** | `@better-giving/paypal` | PayPal SDK Helper |

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

// Use the generated types directly
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

console.log('Order ID:', order.id);
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

Each API module exports types following the OpenAPI structure:

```typescript
{
  paths: {
    '/api/path': {
      get: { parameters, responses, ... },
      post: { requestBody, responses, ... },
      ...
    }
  },
  components: {
    schemas: { ... },
    parameters: { ... },
    responses: { ... }
  }
}
```

## Related Links

- [PayPal REST API Specifications](https://github.com/paypal/paypal-rest-api-specifications)
- [PayPal Developer Documentation](https://developer.paypal.com/docs/api/)
- [openapi-typescript](https://github.com/drwpow/openapi-typescript)
