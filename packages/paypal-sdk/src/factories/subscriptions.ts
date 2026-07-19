import * as subscriptions_module from "../../generated/subscriptions/index.js";
import type { PayPalClient } from "../client.js";
import { apply_client } from "../configure.js";

export const create_subscriptions_service = (client: PayPalClient) =>
  apply_client(subscriptions_module, client);

export type SubscriptionsService = typeof subscriptions_module;
