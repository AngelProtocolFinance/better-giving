import * as vault_module from "../../generated/vault/index.js";
import type { PayPalClient } from "../client.js";
import { apply_client } from "../configure.js";

export const create_vault_service = (client: PayPalClient) =>
  apply_client(vault_module, client);

export type VaultService = typeof vault_module;
