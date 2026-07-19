import * as disputes_module from "../../generated/disputes/index.js";
import type { PayPalClient } from "../client.js";
import { apply_client } from "../configure.js";

export const create_disputes_service = (client: PayPalClient) =>
  apply_client(disputes_module, client);

export type DisputesService = typeof disputes_module;
