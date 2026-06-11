import type { IFsaDocs } from "./schema";

export interface IFsaSigner {
  first_name: string;
  last_name: string;
  /** may be empty */
  role: string;
  email: string;
  org_name: string;
  org_hq_country: string;
  docs: IFsaDocs;
}
