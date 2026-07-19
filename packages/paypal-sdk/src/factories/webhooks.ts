import * as webhooks_module from "../../generated/webhooks/index.js";
import type { PayPalClient } from "../client.js";
import { apply_client } from "../configure.js";

export const create_webhooks_service = (client: PayPalClient) =>
  apply_client(webhooks_module, client);

export type WebhooksService = typeof webhooks_module;
