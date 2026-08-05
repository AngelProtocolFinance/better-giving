export type { ISettlementPreview } from "$/settlement/preview";

export interface INpoOpt {
  id: number;
  name: string;
}

export type TFrom = "cheque" | "daf" | "match";

export interface IFormValues {
  from: TFrom;
  npo: INpoOpt | undefined;
  donor_name: string;
  donor_email: string;
  net: string;
  reference: string;
  /**
   * the donor's original gift an employer's payment matches — the id printed on
   * the donation page and in the filing pack as `Donation {id}`, which is what
   * an employer is asked to quote. never the employer's own new row.
   */
  for_donation_id: string;
}
