import * as orders_module from "../../generated/orders/index.js";
import type { PayPalClient } from "../client.js";
import { apply_client } from "../configure.js";

export const create_orders_service = (client: PayPalClient) =>
  apply_client(orders_module, client);

export type OrdersService = typeof orders_module;
