import type { DonateMethodId, IIncrement, TFrequency } from "../schemas";

export interface IProgram {
  id: string; //uuid
  name: string;
}

export interface IDefault {
  amount_usd: string;
}

export interface IForm {
  id: string;
  /** iso */
  date_created: string;
  tag: string;
  name: string;
  /** default: bg-primary */
  accent_primary?: string;
  /** default: bg-secondary */
  accent_secondary?: string;
  /** all active, when not defined */
  donate_methods?: DonateMethodId[];
  /** defaults when undefined */
  increments?: IIncrement[];
  freq_opts?: TFrequency[];
  /** "smart", number - fixed */
  target: "smart" | number | null; //
  /** npo_id, email */
  owner: string;
  recipient_npo_id: number | null;
  recipient_fund_id: string | null;
  /** received ltd in usd  */
  ltd: number;
  ltd_count: number;
  program?: IProgram;

  defaults?: {
    stripe?: IDefault;
  };
  /** url */
  success_redirect?: string;
  status: "active" | "inactive";
}

export interface IOwnerFormsPageOpts {
  limit?: number;
  next?: string;
  status?: "active" | "inactive";
}
