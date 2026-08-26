import type { TStatus } from "./schema";

export interface IBapp {
  /** wise recipient id */
  id: string;
  npo_id: number;
  bank_summary: string;
  bank_statement_url: string;
  /** iso */
  date_created: string;
  /** iso — when the row last moved state: submission, verdict, or promotion */
  updated_at: string;
  status: TStatus;
  /** maybe empty */
  rejection_reason: string;
}

export interface IBappsOpts {
  status?: TStatus | TStatus[];
  npo_id?: number;
  next?: string;
  limit?: number;
}
