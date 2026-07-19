import * as invoicing_module from "../../generated/invoicing/index.js";
import type { PayPalClient } from "../client.js";

export const create_invoicing_service = (client: PayPalClient) => {
  invoicing_module.OpenAPI.BASE = client.get_base_url();
  invoicing_module.OpenAPI.TOKEN = async () => await client.get_access_token();
  return invoicing_module;
};

export type InvoicingService = typeof invoicing_module;
