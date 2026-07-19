import * as payouts_module from "../../generated/payouts/index.js";
import type { PayPalClient } from "../client.js";
import { apply_client } from "../configure.js";

export const create_payouts_service = (client: PayPalClient) =>
  apply_client(payouts_module, client);

export type PayoutsService = typeof payouts_module;
