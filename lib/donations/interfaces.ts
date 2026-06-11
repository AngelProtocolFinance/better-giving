import type { Except } from "type-fest";
import type { TFrequency } from "../schemas";
import type { IBalanceDeltas, IFees } from "../types/donation";
import type { Ensure } from "../types/utils";
import type { IAmount, IProgram, ITribute } from "./schema";

export type TToType = "npo" | "fund";

export type TDonationSource = "bg-marketplace" | "bg-widget";

export interface ITo {
  /** npo:int, fund:uuid */
  to_id: string;
  to_name: string;
  to_type: TToType;
  to_tip_allowed: boolean;
  /** further distribution e.g. fund npos - number[], empty when `TToType = npo` */
  to_members: string[];
}

export interface IFromLegacyOrPostDonation {
  /** @legacy */
  from_wallet_addr?: string;
  /** appears in npo profile */
  from_public_msg_to_npo?: string;
  /** whether donor appears on npo profile  */
  from_public?: boolean;
  from_private_msg_to_npo?: string;
}

export interface IFrom {
  from_email: string;
  from_name?: string;
  from_title?: string;
  from_company_name?: string;
  from_addr_street?: string;
  from_addr_city?: string;
  from_addr_state?: string;
  from_addr_zip_code?: string;
  from_addr_country?: string;
}

/**
 * "created": created,
 * "intent":  payment initiated, not yet confirmed
 * "expired": intent expired without confirmation
 * "confirmed": confirmed by payment processor, not yet settled
 * "settled"
 * "failed"
 * "cancelled"
 */
export type TStatus =
  | "created"
  | "intent"
  | "expired"
  | "confirmed"
  | "settled"
  | "failed"
  | "refunded"
  | "refunded_loss"
  | "cancelled";

export interface ISettlement {
  id: string;
  date: string;
  /** e.g. USD, USDC*/
  currency: string;
  net: number;
  fee: number;
}

export interface IReferrer {
  id: string;
  cf_from_tip: number;
  cf_from_fee: number;
}

export interface IParent {
  id: string;
  to_id: string;
  to_name: string;
  to_members: string[];
}

export interface IAllocation {
  liq: number;
  lock: number;
  cash: number;
}

export interface IToSettings {
  fiscal_sponsored: boolean;
  alloc: IAllocation;
}

export interface IDonationDist {
  id: string;
  /** currency of amounts in this interface */
  currency: string;
  gross: number;
  net: number;
  fees: IFees;
  fee_allowance: number;
  fee_allowance_excess: number;
  referrer?: IReferrer;
  form_tag?: string;
  to_settings: IToSettings;
  parent: IParent;
}

export interface IDonation extends ITo, IFrom, IFromLegacyOrPostDonation {
  id: string;
  /** from migrations */
  id_v1?: string;
  /** unit of amount.currency per usd */
  upusd: number;
  status: TStatus;

  /** for settlement records,  */
  created_at: string;
  updated_at: string;

  amount: IAmount;
  /** uppercase */
  currency: string;
  program?: IProgram;
  source: TDonationSource | (string & {});
  /** form id if using new form */
  form_id?: string;
  frequency: TFrequency;

  /** {processor}:{pm_id} e.g. stripe:card, stripe:link */
  via: string;
  /** chariot - grant id, np - payment id, stripe - verification url */
  via_extra?: string;
  /**
   * for recurring: if this record is already settled (first time, or one-time), create new id
   * not present for derived records (e.g. tip record, npo record created from fund record)
   * */
  settlement?: ISettlement;

  /** present on derived records (e.g. tip, npo derived from fund) */
  dist?: IDonationDist;

  /** links recurring charges to their parent subscription */
  subscription_id?: string;

  //misc
  tribute?: ITribute;
}

export interface IDonationSettled extends Ensure<IDonation, "settlement"> {}

export interface IDonationUpdate
  extends Partial<Except<IDonation, "id" | "created_at" | "updated_at">> {}

export interface IDonsFromOpts {
  limit?: number;
  next?: string;
  status?: TStatus;
}

export interface ChariotMetadata {
  don_id: string;
  amount: IAmount;
}

// NOTE: add a `reversal_id` to don_db and once IReversal is complete, write some Reversal#{reversal_id} record so that reversal record is included in the transaction
/** if any of the conditions are not met, the reversal will be skipped, and BG will absorb the loss */
export interface IReversals {
  id: string;
  npo: number;
  /** donor facing value */
  gross: number;
  /** npo facing value */
  net: number;
  /** - change don status to `refunded`,
   *  - delete donor public msg if any
   */
  don: string;
  /** condition: transfer_id must be `undefined` */
  don_settled: string;
  /** change status to `refunded` */
  referrer_commission_key?: {
    /** referrer_id */
    pk: string;
    /** date */
    sk: string;
  };
  referrer_commission_ltd?: {
    /** referrer */
    referrer: string;
    referred: number;
    /** amount to deduct */
    amount: number;
  };
  balance_deltas: IBalanceDeltas;
  alloc: {
    /** condition: if present, amount must be >= liq balance (doesn't account for transfers to other account )
     *  action: create refund tx
     */
    liq?: string;
    /** condition: if present, amount must be >= lock balance (doesn't account for transfers to other account )
     *  action: create refund tx
     */
    lock?: string;
    /** condition: if present, status: must still be pending */
    cash?: string;
  };
  /** if donation is attributed to fund, revert increment by `net` */
  fund?: string;
  /** if donation is attributed to form, revert increment by `net` */
  form?: string;
  /** if donation is attributed to program, revert increment by `net` */
  program?: string;

  /** used `id` to mark record as `refunded` */
  revenue: {
    tip?: { amount: number; id: string };
    fee_fsa?: { amount: number; id: string };
    fee_base?: { amount: number; id: string };
  };

  status: "init" | "completed" | "failed" | "loss";
  error?: string;
}
