import type { IInterestLog } from "./schemas";

export interface IBalLog {
  date: string;
  /** npo id, liq balance */
  balances: Record<string, number>;
  total: number;
}

export interface IInterestLogDb extends IInterestLog {
  /** matches savings tx record */
  id: string;
  alloc: Record<string, number>;
}

export interface IPageOptions {
  limit?: number;
  next?: string;
  consistent?: boolean;
}
export interface IBalLogsOptions extends IPageOptions {
  date_start?: string;
  date_end?: string;
}
