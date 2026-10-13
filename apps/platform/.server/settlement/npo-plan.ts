import {
  calc_settlement_plan,
  type NpoSettlementContext,
  type SettlementPlan,
} from "@/settlement/plan";
import type { IInput } from "@/types/donation-dist";
import type { INpo } from "../pg/queries/npo";
import { routed_account } from "../stripe-connect/routing";

const plan_ctx = (npo: INpo): NpoSettlementContext => ({
  id: npo.id,
  name: npo.name,
  fiscal_sponsored: npo.fiscal_sponsored,
  hide_bg_tip: npo.hide_bg_tip,
  allocation: npo.allocation,
  lock_units: npo.lock_units,
  liq: npo.liq,
  referrer_user: npo.referrer_user,
  referrer_npo: npo.referrer_npo,
  referrer_expiry: npo.referrer_expiry,
});

/** `i`'s share of `npo` as settlement books it, routed or pooled. settling, its
 * redelivery resend and the admin preview all plan through here */
export const npo_plan = (i: IInput, npo: INpo): SettlementPlan =>
  calc_settlement_plan(i, plan_ctx(npo), routed_account(npo, i.tx.via));
