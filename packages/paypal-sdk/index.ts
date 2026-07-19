// Export PayPalClient
export {
  PayPalClient,
  type PayPalClientConfig,
  type PayPalEnvironment,
} from "./src/client.js";
export {
  type CatalogService,
  create_catalog_service,
} from "./src/factories/catalog.js";
export {
  create_disputes_service,
  type DisputesService,
} from "./src/factories/disputes.js";
export {
  create_invoicing_service,
  type InvoicingService,
} from "./src/factories/invoicing.js";
// Export tree-shakeable factory functions
export {
  create_orders_service,
  type OrdersService,
} from "./src/factories/orders.js";
export {
  create_partner_referrals_service,
  type PartnerReferralsService,
} from "./src/factories/partner-referrals.js";
export {
  create_payments_service,
  type PaymentsService,
} from "./src/factories/payments.js";
export {
  create_payouts_service,
  type PayoutsService,
} from "./src/factories/payouts.js";
export {
  create_subscriptions_service,
  type SubscriptionsService,
} from "./src/factories/subscriptions.js";
export {
  create_tracking_service,
  type TrackingService,
} from "./src/factories/tracking.js";
export {
  create_transactions_service,
  type TransactionsService,
} from "./src/factories/transactions.js";
export {
  create_vault_service,
  type VaultService,
} from "./src/factories/vault.js";
export {
  create_web_profiles_service,
  type WebProfilesService,
} from "./src/factories/web-profiles.js";
export {
  create_webhooks_service,
  type WebhooksService,
} from "./src/factories/webhooks.js";
