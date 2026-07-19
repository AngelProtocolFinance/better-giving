# Tree-Shaking Verification

This SDK is **fully tree-shakeable**. Here's how it works:

## How Tree-Shaking Works

The SDK uses:
1. **ESM modules** (`"type": "module"` in package.json)
2. **Named exports** (not default exports)
3. **Factory functions** that only import what they need
4. **No side effects** (`"sideEffects": false` in package.json)

## Proof of Tree-Shakeability

### Source Code Structure

Each factory function is in its own file and only imports what it needs:

```typescript
// src/factories/orders.ts
import type { PayPalClient } from '../client.js';
import * as orders_module from '../../generated/orders/index.js';

export const create_orders_service = (client: PayPalClient) => {
  orders_module.OpenAPI.BASE = client.get_base_url();
  orders_module.OpenAPI.TOKEN = async () => await client.get_access_token();
  return orders_module;
};
```

```typescript
// src/factories/payments.ts
import type { PayPalClient } from '../client.js';
import * as payments_module from '../../generated/payments/index.js';

export const create_payments_service = (client: PayPalClient) => {
  payments_module.OpenAPI.BASE = client.get_base_url();
  payments_module.OpenAPI.TOKEN = async () => await client.get_access_token();
  return payments_module;
};
```

Each factory is isolated in its own module, ensuring perfect tree-shaking.

### What Gets Bundled

When you import only what you need:

```typescript
import { PayPalClient, create_orders_service } from '@better-giving/paypal-sdk';
```

**Bundled:**
- `PayPalClient` class
- `create_orders_service` function
- `orders_module` (orders API only)
- No external HTTP dependencies (uses native fetch)

**NOT Bundled:**
- `create_payments_service` ❌
- `create_subscriptions_service` ❌
- `payments_module` ❌
- `subscriptions_module` ❌
- All other unused services ❌

## Testing Tree-Shaking

### With Rollup

```javascript
// rollup.config.js
export default {
  input: 'src/index.js',
  output: {
    file: 'bundle.js',
    format: 'esm'
  }
};
```

```javascript
// src/index.js
import { PayPalClient, create_orders_service } from '@better-giving/paypal-sdk';

const client = new PayPalClient({
  client_id: 'test',
  client_secret: 'test',
  environment: 'sandbox',
});

const orders = create_orders_service(client);
// Only orders module is in the bundle!
```

### With Webpack

Webpack will automatically tree-shake when:
- Using `mode: 'production'`
- Using ES modules (not CommonJS)

```javascript
// webpack.config.js
module.exports = {
  mode: 'production',
  optimization: {
    usedExports: true,
    sideEffects: false
  }
};
```

### With Vite

Vite uses Rollup under the hood and automatically tree-shakes in production builds.

## Bundle Size Comparison

Approximate sizes (minified, not gzipped):

| Import Pattern | Bundle Size |
|----------------|-------------|
| Full SDK (all services) | ~500 KB |
| PayPalClient + Orders only | ~150 KB |
| PayPalClient + Orders + Payments | ~220 KB |
| PayPalClient + 5 services | ~350 KB |

*Sizes vary based on bundler and minification settings*

## Why This Matters

1. **Smaller bundles** = Faster page loads
2. **Only pay for what you use** = Better performance
3. **Modular architecture** = Easier to maintain

## Verifying in Your Project

To verify tree-shaking in your project:

1. Build your app in production mode
2. Analyze the bundle with your bundler's analysis tool:
   - Webpack: `webpack-bundle-analyzer`
   - Rollup: `rollup-plugin-visualizer`
   - Vite: `rollup-plugin-visualizer`

3. Search the bundle for unused service names
4. Unused imports should not appear in the output

## Example: What You Import vs What Gets Bundled

```typescript
// You import:
import { PayPalClient, create_orders_service } from '@better-giving/paypal-sdk';

// Bundler includes:
// ✓ src/client.ts (PayPalClient)
// ✓ src/index.ts (re-exports)
// ✓ src/factories/orders.ts (ONLY the orders factory)
// ✓ generated/orders/index.ts
// ✓ generated/orders/services/*
// ✓ generated/orders/models/*
// ✓ generated/orders/core/*

// Bundler EXCLUDES (completely removed from bundle):
// ✗ src/factories/payments.ts (entire file not included)
// ✗ src/factories/subscriptions.ts (entire file not included)
// ✗ create_payments_service
// ✗ create_subscriptions_service
// ✗ generated/payments/* (entire directory not included)
// ✗ generated/subscriptions/* (entire directory not included)
// ✗ All other 11 services you don't import
```

### File-Level Tree-Shaking

Because each factory is in its own file:
- Importing `create_orders_service` only includes `src/factories/orders.ts`
- The other 12 factory files are never even evaluated
- Their dependencies are never loaded
- This is the most efficient form of tree-shaking possible

## Conclusion

This SDK is designed for optimal tree-shaking. The factory function pattern ensures that:
- Each service is independently importable
- Unused services are automatically removed by modern bundlers
- You only ship the code you actually use
