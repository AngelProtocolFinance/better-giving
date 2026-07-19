import * as partner_referrals_module from "../../generated/partner-referrals/index.js";
import type { PayPalClient } from "../client.js";

export const create_partner_referrals_service = (client: PayPalClient) => {
  partner_referrals_module.OpenAPI.BASE = client.get_base_url();
  partner_referrals_module.OpenAPI.TOKEN = async () =>
    await client.get_access_token();
  return partner_referrals_module;
};

export type PartnerReferralsService = typeof partner_referrals_module;
