import type { IMsg } from "../types";

export interface Payload {
  npo_id: number;
  account: string;
  account_other: string;
  bal_begin: string | number;
  bal_end: string | number;
  amount: string | number;
  date_created: string | Date;
}

export const to_msg = (p: Payload): IMsg => ({
  id: "lock-tx-created",
  payload: p,
  dedupe: `lock_tx_${p.npo_id}_${String(p.date_created).replace(/:/g, "")}`,
});

export const is_for = (msg: IMsg): msg is IMsg & { payload: Payload } =>
  msg.id === "lock-tx-created";
