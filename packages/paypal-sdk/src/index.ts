export {
  PayPalClient,
  type PayPalClientConfig,
  type PayPalEnvironment,
} from "./client.js";
export {
  type CatalogService,
  create_catalog_service,
} from "./factories/catalog.js";
export {
  create_disputes_service,
  type DisputesService,
} from "./factories/disputes.js";
export {
  create_invoicing_service,
  type InvoicingService,
} from "./factories/invoicing.js";
// tree-shakeable factory function exports
export {
  create_orders_service,
  type OrdersService,
} from "./factories/orders.js";
export {
  create_partner_referrals_service,
  type PartnerReferralsService,
} from "./factories/partner-referrals.js";
export {
  create_payments_service,
  type PaymentsService,
} from "./factories/payments.js";
export {
  create_payouts_service,
  type PayoutsService,
} from "./factories/payouts.js";
export {
  create_subscriptions_service,
  type SubscriptionsService,
} from "./factories/subscriptions.js";
export {
  create_tracking_service,
  type TrackingService,
} from "./factories/tracking.js";
export {
  create_transactions_service,
  type TransactionsService,
} from "./factories/transactions.js";
export { create_vault_service, type VaultService } from "./factories/vault.js";
export {
  create_web_profiles_service,
  type WebProfilesService,
} from "./factories/web-profiles.js";
export {
  create_webhooks_service,
  type WebhooksService,
} from "./factories/webhooks.js";
