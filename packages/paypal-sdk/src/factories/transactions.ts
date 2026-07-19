import * as transactions_module from "../../generated/transactions/index.js";
import type { PayPalClient } from "../client.js";
import { apply_client } from "../configure.js";

export const create_transactions_service = (client: PayPalClient) =>
  apply_client(transactions_module, client);

export type TransactionsService = typeof transactions_module;
