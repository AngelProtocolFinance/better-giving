import * as payouts_module from "../../generated/payouts/index.js";
import type { PayPalClient } from "../client.js";

export const create_payouts_service = (client: PayPalClient) => {
  payouts_module.OpenAPI.BASE = client.get_base_url();
  payouts_module.OpenAPI.TOKEN = async () => await client.get_access_token();
  return payouts_module;
};

export type PayoutsService = typeof payouts_module;
