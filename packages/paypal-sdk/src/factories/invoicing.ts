import * as invoicing_module from "../../generated/invoicing/index.js";
import type { PayPalClient } from "../client.js";
import { apply_client } from "../configure.js";

export const create_invoicing_service = (client: PayPalClient) =>
  apply_client(invoicing_module, client);

export type InvoicingService = typeof invoicing_module;
