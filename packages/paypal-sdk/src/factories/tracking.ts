import * as tracking_module from "../../generated/tracking/index.js";
import type { PayPalClient } from "../client.js";

export const create_tracking_service = (client: PayPalClient) => {
  tracking_module.OpenAPI.BASE = client.get_base_url();
  tracking_module.OpenAPI.TOKEN = async () => await client.get_access_token();
  return tracking_module;
};

export type TrackingService = typeof tracking_module;
