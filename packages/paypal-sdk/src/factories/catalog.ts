import * as catalog_module from "../../generated/catalog/index.js";
import type { PayPalClient } from "../client.js";
import { apply_client } from "../configure.js";

export const create_catalog_service = (client: PayPalClient) =>
  apply_client(catalog_module, client);

export type CatalogService = typeof catalog_module;
