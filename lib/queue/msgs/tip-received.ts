import type { IMsg } from "../types";

export interface Payload {
  id: string;
  date: string;
  npo_name: string;
  npo_id: number;
  type_tip: {
    input: number;
    denom: string;
    input_usd: number;
  };
}

export const to_msg = (p: Payload): IMsg => ({
  id: "tip-received",
  payload: p,
  dedupe: `tip_${p.id}`,
});

export const is_for = (msg: IMsg): msg is IMsg & { payload: Payload } =>
  msg.id === "tip-received";
