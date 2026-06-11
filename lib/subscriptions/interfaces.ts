export type TStatus = "active" | "inactive";
export type TStatusFlag = "0" | "1";
export type TPlatform = "stripe" | "paypal";
export type TInterval = "day" | "month" | "week" | "year";

export const to_flag = (status: TStatus): TStatusFlag => {
  // "0" is lexicographically before "1, but scan index forward : false "
  return status === "active" ? "1" : "0";
};
export interface ISub {
  id: string;
  /** iso */
  created_at: string;
  /** iso */
  updated_at: string;
  interval: TInterval;
  interval_count: number;

  /** iso */
  next_billing: string;
  amount: number;
  amount_usd: number;
  currency: string;
  product_id: string;
  to_npo_id: number | null;
  to_fund_id: string | null;
  to_name: string;

  platform: TPlatform;
  status: TStatus;
  status_cancel_reason?: string | null;

  /** email, */
  from_id: string;
}

export interface ISubUpdate extends Partial<Omit<ISub, "id">> {}

const MONTHLY_FACTOR: Record<TInterval, number> = {
  day: 30,
  week: 4.33,
  month: 1,
  year: 1 / 12,
};

export function monthly_amount(
  amount_usd: number,
  interval: TInterval,
  interval_count: number
): number {
  const factor = MONTHLY_FACTOR[interval] ?? 1;
  return (amount_usd * factor) / interval_count;
}
