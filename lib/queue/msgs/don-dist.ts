import type { IFromAddress } from "@/donation";
import type { TDonationSource } from "@/donation/schema";
import type { TFrequency } from "@/schemas";
import type { IMsg } from "../types";

export interface Payload {
  id: string;
  date_created: string;
  amount: number;
  amount_usd: number;
  amount_denom: string;
  frequency: TFrequency;
  via: string;
  source: TDonationSource | (string & {});
  to_id: number;
  to_name: string;
  net: number;
  sttl_date: string;
  from_email: string;
  from?: { name?: string; company?: string; address?: IFromAddress };
  program?: { id: string; name: string };
  to_claimed?: boolean;
  form?: { id: string; tag?: string };
}

export const to_msg = (p: Payload): IMsg => ({
  id: "don-dist",
  payload: p,
  dedupe: `don.dist_${p.id}_${p.to_id}`,
});

export const is_for = (msg: IMsg): msg is IMsg & { payload: Payload } =>
  msg.id === "don-dist";
