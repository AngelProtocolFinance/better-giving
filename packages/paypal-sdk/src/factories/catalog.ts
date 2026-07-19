import * as catalog_module from "../../generated/catalog/index.js";
import type { PayPalClient } from "../client.js";

export const create_catalog_service = (client: PayPalClient) => {
  catalog_module.OpenAPI.BASE = client.get_base_url();
  catalog_module.OpenAPI.TOKEN = async () => await client.get_access_token();
  return catalog_module;
};

export type CatalogService = typeof catalog_module;
