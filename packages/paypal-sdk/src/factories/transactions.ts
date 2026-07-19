import * as transactions_module from "../../generated/transactions/index.js";
import type { PayPalClient } from "../client.js";

export const create_transactions_service = (client: PayPalClient) => {
  transactions_module.OpenAPI.BASE = client.get_base_url();
  transactions_module.OpenAPI.TOKEN = async () =>
    await client.get_access_token();
  return transactions_module;
};

export type TransactionsService = typeof transactions_module;
