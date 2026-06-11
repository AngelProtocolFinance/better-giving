export type TStatus = "pending" | "paid" | "refunded" | "refunded_loss";

export interface ICommission {
  /** iso timestamp */
  date: string;
  referrer_user?: string;
  referrer_npo?: string;
  donation_id: string;
  /** nonprofit id */
  npo_id: number;
  /** combined from various sources */
  amount: number;
  status: TStatus;
}
/** referrer lifetime data — per-npo commission aggregates */
export interface ICommissionsLtd {
  referrer: string;
  /** number only, string is to just conform with referrer */
  [npo: string]: string | number;
}

export interface IPayout {
  /**wise quote uuid — absent on legacy records */
  id: string;
  date: string;
  amount: number;
  referrer_user?: string;
  referrer_npo?: string;
  // either error or transfer_id
  error?: string;
  transfer_id?: number;
}

export interface IPayoutLtd {
  referrer: string;
  amount: number;
}
