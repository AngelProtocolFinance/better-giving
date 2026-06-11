import type { IMsg } from "../types";

export interface Payload {
  npo_id: number;
  bank_summary?: string;
  rejection_reason?: string;
}

export const to_msg = (p: Payload): IMsg => ({
  id: "banking-new",
  payload: p,
  dedupe: `banking.new_${p.npo_id}`,
});

export const is_for = (msg: IMsg): msg is IMsg & { payload: Payload } =>
  msg.id === "banking-new";
