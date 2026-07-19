import * as disputes_module from "../../generated/disputes/index.js";
import type { PayPalClient } from "../client.js";

export const create_disputes_service = (client: PayPalClient) => {
  disputes_module.OpenAPI.BASE = client.get_base_url();
  disputes_module.OpenAPI.TOKEN = async () => await client.get_access_token();
  return disputes_module;
};

export type DisputesService = typeof disputes_module;
