import type { IMsg } from "../types";

export interface Payload {
  id: string;
  r_id: string;
}

export const to_msg = (p: Payload): IMsg => ({
  id: "reg-created",
  payload: p,
  dedupe: `reg.created_${p.id}`,
});

export const is_for = (msg: IMsg): msg is IMsg & { payload: Payload } =>
  msg.id === "reg-created";
