import * as payments_module from "../../generated/payments/index.js";
import type { PayPalClient } from "../client.js";

export const create_payments_service = (client: PayPalClient) => {
  payments_module.OpenAPI.BASE = client.get_base_url();
  payments_module.OpenAPI.TOKEN = async () => await client.get_access_token();
  return payments_module;
};

export type PaymentsService = typeof payments_module;
