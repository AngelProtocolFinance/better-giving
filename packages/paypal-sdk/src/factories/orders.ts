import * as orders_module from "../../generated/orders/index.js";
import type { PayPalClient } from "../client.js";

export const create_orders_service = (client: PayPalClient) => {
  orders_module.OpenAPI.BASE = client.get_base_url();
  orders_module.OpenAPI.TOKEN = async () => await client.get_access_token();
  return orders_module;
};

export type OrdersService = typeof orders_module;
