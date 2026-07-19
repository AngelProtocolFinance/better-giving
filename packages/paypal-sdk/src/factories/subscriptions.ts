import * as subscriptions_module from "../../generated/subscriptions/index.js";
import type { PayPalClient } from "../client.js";

export const create_subscriptions_service = (client: PayPalClient) => {
  subscriptions_module.OpenAPI.BASE = client.get_base_url();
  subscriptions_module.OpenAPI.TOKEN = async () =>
    await client.get_access_token();
  return subscriptions_module;
};

export type SubscriptionsService = typeof subscriptions_module;
