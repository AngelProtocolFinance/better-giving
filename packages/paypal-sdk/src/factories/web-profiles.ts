import * as web_profiles_module from "../../generated/web-profiles/index.js";
import type { PayPalClient } from "../client.js";
import { apply_client } from "../configure.js";

export const create_web_profiles_service = (client: PayPalClient) =>
  apply_client(web_profiles_module, client);

export type WebProfilesService = typeof web_profiles_module;
