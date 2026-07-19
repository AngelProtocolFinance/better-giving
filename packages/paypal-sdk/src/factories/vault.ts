import * as vault_module from "../../generated/vault/index.js";
import type { PayPalClient } from "../client.js";

export const create_vault_service = (client: PayPalClient) => {
  vault_module.OpenAPI.BASE = client.get_base_url();
  vault_module.OpenAPI.TOKEN = async () => await client.get_access_token();
  return vault_module;
};

export type VaultService = typeof vault_module;
