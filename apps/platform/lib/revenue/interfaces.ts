export type RevenueType = "tip" | "base-fee" | "fsa-fee";

export interface IRevenueLog {
  id: string;
  date: string;
  donation_id: string;
  npo_id: number | null;
  fund_id: string | null;
  npo_name: string | null;
  type: RevenueType;
  gross: number; // raw fee/tip amount
  commission: number; // referral commission portion (rate * gross)
  revenue: number; // gross - commission
  status: "final" | "refunded" | "refunded_loss";
  /** tip details: for tip notif email */
  type_tip?: {
    denom: string;
    /** in denom */
    input: number;
    input_usd: number;
    fa_excess: number;
    pf: number;
  } | null;
}

export interface ILtdItems {
  tip: number;
  base_fee: number;
  fsa_fee: number;
}

export interface IRevenueLtd extends ILtdItems {
  [key: `#${number}.${keyof ILtdItems}`]: number;
}

export interface IRevenuePageOptions {
  limit?: number;
  next?: string;
}

export type LossType = "balance_liq" | "balance_lock" | "payout" | "write_off";

export interface ILossLog {
  id: string;
  date: string;
  donation_id: string;
  /** null on a write-off, which is of an owed row */
  dist_id: string | null;
  /** exactly one of the three: whose loss it is */
  npo_id: number | null;
  referrer_user: string | null;
  referrer_npo: string | null;
  type: LossType;
  amount: number; // usd gross of the dist less cash recovered — total platform cost
  npo_amount: number; // r.net less cash recovered — npo balance not recoverable
  fees_bg: number; // base + fsa — reversed from revenue
  fees_processing: number; // stripe fee — never recoverable
  reason: string;
  /** the admin's user id, on a write-off */
  actor: string | null;
}

export interface ILossLtd {
  total: number;
  [key: `#${number}`]: number;
}

export interface ILossPageOptions {
  limit?: number;
  next?: string;
}
