export type { ISettlementPreview } from "$/settlement/preview";

export interface INpoOpt {
  id: number;
  name: string;
}

export type TFrom = "cheque" | "daf";

export interface IFormValues {
  from: TFrom;
  npo: INpoOpt | undefined;
  donor_name: string;
  donor_email: string;
  net: string;
  reference: string;
}
