import type * as products from "./generated/catalog-products.js";
import type * as orders from "./generated/orders.js";
import type * as payments from "./generated/payments.js";
import type * as payments_v1 from "./generated/payments-v1.js";
import type * as subscriptions from "./generated/subscriptions.js";
import type * as webhooks from "./generated/webhooks.js";

/**
 * api paths - using path definitions from generated types
 */

export const create_order_path: Extract<
  keyof orders.paths,
  "/v2/checkout/orders"
> = "/v2/checkout/orders";

export const create_product_path: Extract<
  keyof products.paths,
  "/v1/catalogs/products"
> = "/v1/catalogs/products";

export const create_plan_path: Extract<
  keyof subscriptions.paths,
  "/v1/billing/plans"
> = "/v1/billing/plans";

export const get_plans_path: Extract<
  keyof subscriptions.paths,
  "/v1/billing/plans"
> = "/v1/billing/plans";

export const get_order_path = "/v2/checkout/orders/{id}" as const;

export const capture_order_path = "/v2/checkout/orders/{id}/capture" as const;

export const get_plan_path = "/v1/billing/plans/{id}" as const;

export const deactivate_plan_path =
  "/v1/billing/plans/{id}/deactivate" as const;

export const create_subscription_path: Extract<
  keyof subscriptions.paths,
  "/v1/billing/subscriptions"
> = "/v1/billing/subscriptions";

export const get_subscription_path = "/v1/billing/subscriptions/{id}" as const;

export const cancel_subscription_path =
  "/v1/billing/subscriptions/{id}/cancel" as const;

export const oauth_token_path = "/v1/oauth2/token" as const;

export type PurchaseUnitsRequest =
  orders.components["schemas"]["purchase_unit_request"];

export type Order = orders.components["schemas"]["order"];
export type Capture = payments.components["schemas"]["capture-2"];
export type Subs = subscriptions.components["schemas"]["subscription"];
export type Sale = payments_v1.components["schemas"]["sale"];
export type WebhookEvent = webhooks.components["schemas"]["event"];

/**
 * type for create order request body
 */
export type CreateOrderRequest =
  orders.paths["/v2/checkout/orders"]["post"]["requestBody"]["content"]["application/json"];

/**
 * type for create order response
 */
export type CreateOrderResponse =
  orders.paths["/v2/checkout/orders"]["post"]["responses"]["201"]["content"]["application/json"];

/**
 * type for get order response
 */
export type GetOrderResponse =
  orders.paths["/v2/checkout/orders/{id}"]["get"]["responses"]["200"]["content"]["application/json"];

/**
 * type for capture order response
 */
export type CaptureOrderResponse =
  orders.paths["/v2/checkout/orders/{id}/capture"]["post"]["responses"]["201"]["content"]["application/json"];

/**
 * type for create product request body
 */
export type CreateProductRequest = NonNullable<
  products.paths["/v1/catalogs/products"]["post"]["requestBody"]
>["content"]["application/json"];

/**
 * type for create product response
 */
export type CreateProductResponse =
  products.paths["/v1/catalogs/products"]["post"]["responses"]["201"]["content"]["application/json"];

/**
 * type for create plan request body
 */
export type CreatePlanRequest = NonNullable<
  subscriptions.paths["/v1/billing/plans"]["post"]["requestBody"]
>["content"]["application/json"];

/**
 * type for create plan response
 */
export type CreatePlanResponse =
  subscriptions.paths["/v1/billing/plans"]["post"]["responses"]["201"]["content"]["application/json"];

/**
 * type for get plans query parameters
 */
export type GetPlansParams = NonNullable<
  subscriptions.paths["/v1/billing/plans"]["get"]["parameters"]["query"]
>;

/**
 * type for get plans response
 */
export type GetPlansResponse =
  subscriptions.paths["/v1/billing/plans"]["get"]["responses"]["200"]["content"]["application/json"];

/**
 * type for get plan response (single plan)
 */
export type GetPlanResponse =
  subscriptions.paths["/v1/billing/plans/{id}"]["get"]["responses"]["200"]["content"]["application/json"];

/**
 * type for deactivate plan response
 */
export type DeactivatePlanResponse =
  subscriptions.paths["/v1/billing/plans/{id}/deactivate"]["post"]["responses"]["204"];

/**
 * type for create subscription request body
 */
export type CreateSubscriptionRequest = NonNullable<
  subscriptions.paths["/v1/billing/subscriptions"]["post"]["requestBody"]
>["content"]["application/json"];

/**
 * type for create subscription response
 */
export type CreateSubscriptionResponse =
  subscriptions.paths["/v1/billing/subscriptions"]["post"]["responses"]["201"]["content"]["application/json"];

/**
 * type for get subscription response
 */
export type GetSubscriptionResponse =
  subscriptions.paths["/v1/billing/subscriptions/{id}"]["get"]["responses"]["200"]["content"]["application/json"];

/**
 * type for cancel subscription request body
 */
export type CancelSubscriptionRequest = NonNullable<
  subscriptions.paths["/v1/billing/subscriptions/{id}/cancel"]["post"]["requestBody"]
>["content"]["application/json"];

/**
 * paypal sdk configuration
 */
export interface ISdkConfig {
  client_id: string;
  client_secret: string;
  api_url: string;
}

/**
 * paypal access token response
 */
export interface IAccessTokenRes {
  access_token: string;
  token_type: string;
  expires_in: number;
}
