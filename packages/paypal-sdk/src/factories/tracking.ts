import * as tracking_module from "../../generated/tracking/index.js";
import type { PayPalClient } from "../client.js";
import { apply_client } from "../configure.js";

export const create_tracking_service = (client: PayPalClient) =>
  apply_client(tracking_module, client);

export type TrackingService = typeof tracking_module;
