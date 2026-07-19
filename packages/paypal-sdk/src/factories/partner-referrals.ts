import * as partner_referrals_module from "../../generated/partner-referrals/index.js";
import type { PayPalClient } from "../client.js";
import { apply_client } from "../configure.js";

export const create_partner_referrals_service = (client: PayPalClient) =>
  apply_client(partner_referrals_module, client);

export type PartnerReferralsService = typeof partner_referrals_module;
