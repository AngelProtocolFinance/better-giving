import * as web_profiles_module from "../../generated/web-profiles/index.js";
import type { PayPalClient } from "../client.js";

export const create_web_profiles_service = (client: PayPalClient) => {
  web_profiles_module.OpenAPI.BASE = client.get_base_url();
  web_profiles_module.OpenAPI.TOKEN = async () =>
    await client.get_access_token();
  return web_profiles_module;
};

export type WebProfilesService = typeof web_profiles_module;
