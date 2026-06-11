import type { TFrequency } from "../schemas";
import type { IAllocation, TDonationSource } from "./schema";

export interface IReferrerCommission {
  from_tip: number;
  from_fee: number;
}

// snake_case format used by settled donations in main_table
export interface ITributeNotif {
  to_email: string;
  to_fullname: string;
  from_msg: string;
}

export interface ITribute {
  full_name: string;
  notif?: ITributeNotif;
}

interface IFrom {
  name?: string;
  title?: string;
  company?: string;
  public_msg?: string;
  private_msg?: string;
  address?: IFromAddress;
}

export interface IFromAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
}

export interface IDonSettled {
  id: string;
  status: "settled" | "refunded";
  /** iso */
  date_created: string;
  parent_tx?: string;

  /// DONOR'S INPUT //
  amount: number;
  amount_denom: string;
  amount_usd: number;

  /// SETTLEMENT DETAILS ///
  sttl_date: string;
  sttl: {
    denom: string;
    /** stripe: payment id , nowpayments: payment id */
    id: string;
  };
  fee: { base: number; fsa: number; processing: number };
  fee_allowance: number;
  fee_allowance_excess: number;

  // what the npo received after fees
  net: number;
  frequency: TFrequency;

  /// TO ///
  to_id: number;
  to_name: string;
  to_claimed: boolean;
  to_fiscal_sponsored: boolean;

  /// FROM ///
  from_email: string;
  from: IFrom;

  /// REFERRALS ///
  referrer?: { id: string; commission: IReferrerCommission };
  /** exist when this commission has been paid out */
  referrer_commission_payout_id?: string;

  /// OTHERS ///
  source: TDonationSource | (string & {});
  form?: { id: string; tag?: string };
  via: string;
  allocation: IAllocation;
  tribute?: ITribute;
  program?: { id: string; name: string };
  fund?: { id: string; name: string; members: number[] };
}

export type IDonSettledUpdate = Partial<Omit<IDonSettled, "id">>;

export type TFiatRamp = "STRIPE" | "CHARIOT" | "PAYPAL";
export type TOnHoldStatus = "intent" | "pending";
