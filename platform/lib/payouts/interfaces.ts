export interface IErrorStatus {
  type: "error";
  message: string;
}

export interface ISettledStatus {
  type: "settled";
  settled_date: string;
  settled_id: string;
}
export interface IPendingStatus {
  type: "pending";
}
export interface IRefundedStatus {
  type: "refunded";
}

/** refunded but platform absorbed the loss — NPO kept funds */
export interface IRefundedLossStatus {
  type: "refunded_loss";
}

/** manually cancelled */
export interface ICancelledStatus {
  type: "cancelled";
}

export type PayoutStatus =
  | IErrorStatus
  | ISettledStatus
  | IPendingStatus
  | IRefundedStatus
  | IRefundedLossStatus
  | ICancelledStatus;

/**
 * donation - a payout from a donation
 * liq - withdraw from savings
 * lock - withdraw from investments
 */
export type TSource = "donation" | "liq" | "lock";

export type IPayout<T extends PayoutStatus = PayoutStatus> = {
  id: string;
  source_id: string;
  npo_id: number;
  source: TSource;
  /** date created */
  date: string;
  amount: number;
} & T;

export interface INpoPayoutsOptions {
  next?: string;
  status?: PayoutStatus["type"];
  limit?: number;
}

export interface INpoSettlementsOptions {
  next?: string;
  limit?: number;
}
export interface ISettlement {
  /** transfer id */
  id: string;
  other_id: string;
  /** npo id */
  npo_id: number;
  date: string;
  amount: number;
  sources: string[];
  /** https://docs.wise.com/api-docs/api-reference/transfer */
  status: string;
}
