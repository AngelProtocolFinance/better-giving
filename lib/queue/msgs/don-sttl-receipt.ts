import type { IDonation } from "@/donations";
import type { IMsg } from "../types";

export type Payload = IDonation;

export const to_msg = (p: { id: string | number }): IMsg => ({
  id: "don-sttl-receipt",
  payload: p,
  dedupe: `don.sttl-receipt_${p.id}`,
});

export const is_for = (msg: IMsg): msg is IMsg & { payload: Payload } =>
  msg.id === "don-sttl-receipt";
