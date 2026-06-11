export const stage = process.env.STAGE;
export const base_url = process.env.BASE_URL;

export const app = {
  slug: process.env.APP_SLUG,
  npo_id: process.env.APP_NPO_ID,
  api_encryption_key: process.env.APP_API_ENCRYPTION_KEY,
  session_secret: process.env.APP_SESSION_SECRET,
  cookie_secret: process.env.APP_COOKIE_SECRET,
} as const;

export const ai_gateway = {
  api_key: process.env.AI_GATEWAY_API_KEY,
} as const;

export const anvil = {
  api_key: process.env.ANVIL_API_KEY,
  fsa_template_id: process.env.ANVIL_FSA_TEMPLATE_ID,
  org_slug: process.env.ANVIL_ORG_SLUG,
  webhook_token: process.env.ANVIL_WEBHOOK_TOKEN,
} as const;

export const better_auth = {
  api_key: process.env.BETTER_AUTH_API_KEY,
} as const;

export const blob = {
  read_write_token: process.env.BLOB_READ_WRITE_TOKEN,
} as const;

export const chariot = {
  api_key: process.env.CHARIOT_API_KEY,
  api_url: process.env.CHARIOT_API_URL,
  signing_key: process.env.CHARIOT_SIGNING_KEY,
} as const;

export const coingecko = {
  api_key: process.env.COINGECKO_API_KEY,
} as const;

export const crypto_deposit_addr = {
  eth: process.env.CRYPTO_DEPOSIT_ADDR_ETH,
  evm: process.env.CRYPTO_DEPOSIT_ADDR_EVM,
  hbar: process.env.CRYPTO_DEPOSIT_ADDR_HBAR,
  reef: process.env.CRYPTO_DEPOSIT_ADDR_REEF,
} as const;

export const database = {
  url: process.env.DATABASE_URL,
  url_unpooled: process.env.DATABASE_URL_UNPOOLED,
} as const;

export const discord = {
  bot_token: process.env.DISCORD_BOT_TOKEN,
} as const;

export const finnhub = {
  api_key: process.env.FINNHUB_API_KEY,
} as const;

export const google = {
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
} as const;

export const hubspot = {
  access_token: process.env.HUBSPOT_ACCESS_TOKEN,
  forms_api: process.env.HUBSPOT_FORMS_API,
  portal_id: process.env.HUBSPOT_PORTAL_ID,
  subs_form_id: process.env.HUBSPOT_SUBS_FORM_ID,
  owner_id: process.env.HUBSPOT_OWNER_ID,
  deal_stage_id: process.env.HUBSPOT_DEAL_STAGE_ID,
} as const;

export const nowpayments = {
  api_key: process.env.NOWPAYMENTS_API_KEY,
  api_url: process.env.NOWPAYMENTS_API_URL,
  ipn_secret: process.env.NOWPAYMENTS_IPN_SECRET,
} as const;

export const openexchange = {
  app_id: process.env.OPENEXCHANGE_APP_ID,
} as const;

export const paypal = {
  api_url: process.env.PAYPAL_API_URL,
  client_id: process.env.PAYPAL_CLIENT_ID,
  client_secret: process.env.PAYPAL_CLIENT_SECRET,
  product_id: process.env.PAYPAL_PRODUCT_ID,
  webhook_id: process.env.PAYPAL_WEBHOOK_ID,
  plans: {
    weekly: process.env.PAYPAL_PLANS_WEEKLY,
    monthly: process.env.PAYPAL_PLANS_MONTHLY,
    annual: process.env.PAYPAL_PLANS_ANNUAL,
  },
} as const;

export const qstash = {
  url: process.env.QSTASH_URL,
  token: process.env.QSTASH_TOKEN,
  current_signing_key: process.env.QSTASH_CURRENT_SIGNING_KEY,
  next_signing_key: process.env.QSTASH_NEXT_SIGNING_KEY,
} as const;

export const resend = {
  api_key: process.env.RESEND_API_KEY,
} as const;

export const sentry = {
  dsn: process.env.SENTRY_DSN,
  auth_token: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
} as const;

export const stripe = {
  secret_key: process.env.STRIPE_SECRET_KEY,
  webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
  subs_product_id: process.env.STRIPE_SUBS_PRODUCT_ID,
} as const;

export const wise = {
  api_token: process.env.WISE_API_TOKEN,
  api_url: process.env.WISE_API_URL,
  profile_id: process.env.WISE_PROFILE_ID,
  balance_id_usd: process.env.WISE_BALANCE_ID_USD,
} as const;
