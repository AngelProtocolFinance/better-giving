import type { TStatus } from "./schema";

export interface IBapp {
  /** wise recipient id */
  id: string;
  npo_id: number;
  bank_summary: string;
  bank_statement_url: string;
  /** iso */
  date_created: string;
  status: TStatus;
  /** maybe empty */
  rejection_reason: string;
}

export interface IBappsOpts {
  status?: TStatus;
  next?: string;
  limit?: number;
}
