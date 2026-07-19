# PayPal TypeScript Types

TypeScript type definitions automatically generated from [PayPal's official OpenAPI specifications](https://github.com/paypal/paypal-rest-api-specifications).

## Features

- **Type-safe**: Fully typed interfaces for all PayPal REST APIs
- **Up-to-date**: Generated directly from official PayPal OpenAPI specs
- **Comprehensive**: Covers 13 PayPal APIs including Orders, Payments, Subscriptions, and more
- **Tree-shakeable**: Import only the types you need

## Installation

```bash
npm install @better-giving/paypal
# or
pnpm add @better-giving/paypal
```

## Available Modules

This package provides TypeScript types for the following PayPal APIs:

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

Import types and helper functions from the package:

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

This package includes a simple SDK helper for making API calls:

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

## Example with Fetch

```typescript
import type { CreateOrderRequest, CreateOrderResponse } from '@better-giving/paypal';

async function create_order(order_data: CreateOrderRequest, access_token: string): Promise<CreateOrderResponse> {
  const response = await fetch('https://api.paypal.com/v2/checkout/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${access_token}`
    },
    body: JSON.stringify(order_data)
  });

  if (!response.ok) {
    throw new Error('Failed to create order');
  }

  return response.json();
}
```

## Development

### Prerequisites

- Node.js 20+
- pnpm (via corepack)

### Building from Source

```bash
# Clone the repository
git clone <your-repo-url>
cd paypal-typescript-types

# Enable corepack
corepack enable

# Install dependencies
pnpm install

# Download PayPal OpenAPI specs and generate types
pnpm build
```

### Scripts

- `pnpm build` - Full build process (download specs + generate types + compile)
- `pnpm clean` - Remove generated files and build artifacts
- `pnpm format` - Format code with Biome

This project uses the TypeScript compiler (tsc) for compiling source code and generating type declarations.

## Publishing

To publish a new version:

```bash
# Login to npm registry (first time only)
npm login

# Update version in package.json
npm version patch  # or minor, or major

# Publish to npm registry
npm publish --access public
```

## Updating Types

To update the types when PayPal releases new API specifications:

```bash
pnpm build
npm version patch
npm publish
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

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Disclaimer

This is an unofficial package. For official PayPal SDKs and documentation, visit [PayPal Developer](https://developer.paypal.com/).

## Related Links

- [PayPal REST API Specifications](https://github.com/paypal/paypal-rest-api-specifications)
- [PayPal Developer Documentation](https://developer.paypal.com/docs/api/)
- [openapi-typescript](https://github.com/drwpow/openapi-typescript)
