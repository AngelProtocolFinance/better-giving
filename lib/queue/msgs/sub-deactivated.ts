import type { IMsg } from "../types";

export interface Payload {
  id: string;
  platform: string;
  status_cancel_reason?: string | null;
}

export const to_msg = (p: Payload): IMsg => ({
  id: "sub-deactivated",
  payload: p,
  dedupe: `sub.deactivated_${p.id}`,
});

export const is_for = (msg: IMsg): msg is IMsg & { payload: Payload } =>
  msg.id === "sub-deactivated";
