import * as webhooks_module from "../../generated/webhooks/index.js";
import type { PayPalClient } from "../client.js";

export const create_webhooks_service = (client: PayPalClient) => {
  webhooks_module.OpenAPI.BASE = client.get_base_url();
  webhooks_module.OpenAPI.TOKEN = async () => await client.get_access_token();
  return webhooks_module;
};

export type WebhooksService = typeof webhooks_module;
