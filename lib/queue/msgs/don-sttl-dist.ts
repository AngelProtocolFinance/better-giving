import type { IDonationSettled } from "@/donations";
import type { IMsg } from "../types";

export type Payload = IDonationSettled;

export const to_msg = (p: { id: string | number }): IMsg => ({
  id: "don-sttl-dist",
  payload: p,
  dedupe: `don.sttl-dist_${p.id}`,
});

export const is_for = (msg: IMsg): msg is IMsg & { payload: Payload } =>
  msg.id === "don-sttl-dist";
