import type { IReg } from "@/reg/schema";
import type { IMsg } from "../types";

export type Payload = IReg;

export const to_msg = (p: { id: string | number }): IMsg => ({
  id: "reg-updated",
  payload: p,
  dedupe: `reg.updated_${p.id}_${Date.now()}`,
});

export const is_for = (msg: IMsg): msg is IMsg & { payload: Payload } =>
  msg.id === "reg-updated";
