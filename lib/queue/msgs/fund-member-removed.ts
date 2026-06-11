import type { IMsg } from "../types";

export interface Payload {
  fund_id: string;
  creator_id: string;
  creator_name: string;
  removed_npo_ids: number[];
}

export const to_msg = (p: Payload): IMsg => ({
  id: "fund-member-removed",
  payload: p,
  dedupe: `fund.removed_${p.fund_id}_${p.creator_id}`,
});

export const is_for = (msg: IMsg): msg is IMsg & { payload: Payload } =>
  msg.id === "fund-member-removed";
