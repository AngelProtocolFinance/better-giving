import * as payments_module from "../../generated/payments/index.js";
import type { PayPalClient } from "../client.js";
import { apply_client } from "../configure.js";

export const create_payments_service = (client: PayPalClient) =>
  apply_client(payments_module, client);

export type PaymentsService = typeof payments_module;
