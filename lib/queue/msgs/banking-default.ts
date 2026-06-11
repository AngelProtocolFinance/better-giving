import type { IMsg } from "../types";

export interface Payload {
  npo_id: number;
  bank_summary?: string;
  rejection_reason?: string;
}

export const to_msg = (p: Payload): IMsg => ({
  id: "banking-default",
  payload: p,
  dedupe: `banking.default_${p.npo_id}`,
});

export const is_for = (msg: IMsg): msg is IMsg & { payload: Payload } =>
  msg.id === "banking-default";
