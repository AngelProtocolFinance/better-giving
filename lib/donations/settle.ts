import * as don_sttl_dist from "../queue/msgs/don-sttl-dist";
import * as don_sttl_receipt from "../queue/msgs/don-sttl-receipt";
import type { IMsg } from "../queue/types";
import type {
  IDonation,
  IDonationSettled,
  IDonationUpdate,
  ISettlement,
} from "./interfaces";

interface CommonInputs {
  order_id: string;
  settlement: ISettlement;
  via?: string;
}

export type SettleInputs =
  | (CommonInputs & {
      kind: "one-time";
      prior: IDonation;
    })
  | (CommonInputs & {
      kind: "first-recurring";
      prior: IDonation;
      subs_id: string;
    })
  | (CommonInputs & {
      kind: "rebill";
      prior: IDonationSettled;
      subs_id: string;
      new_id: string;
    });

export type SettleResult =
  | {
      op: "update";
      order_id: string;
      patch: IDonationUpdate;
      msgs: IMsg[];
    }
  | {
      op: "put";
      row: IDonationSettled;
      msgs: IMsg[];
    };

/**
 * decide the donation-row write + queue messages that result from a
 * provider settle event. callers project provider-specific event shapes
 * into `SettleInputs`, then dispatch on the returned `op` to write and
 * enqueue. msgs are precomputed from the projected post-write donation.
 */
export function calc_donation_settle(i: SettleInputs): SettleResult {
  if (i.kind === "rebill") {
    const row: IDonationSettled = {
      ...i.prior,
      id: i.new_id,
      id_v1: undefined,
      created_at: i.settlement.date,
      updated_at: i.settlement.date,
      settlement: i.settlement,
      subscription_id: i.subs_id,
      ...(i.via ? { via: i.via } : {}),
    };
    return {
      op: "put",
      row,
      msgs: [don_sttl_dist.to_msg(row), don_sttl_receipt.to_msg(row)],
    };
  }

  const patch: IDonationUpdate = {
    status: "settled",
    settlement: i.settlement,
    ...(i.via ? { via: i.via } : {}),
    ...(i.kind === "first-recurring" ? { subscription_id: i.subs_id } : {}),
  };
  // settlement is always set above, so the merged row is IDonationSettled.
  const projected = { ...i.prior, ...patch } as IDonationSettled;
  return {
    op: "update",
    order_id: i.order_id,
    patch,
    msgs: [don_sttl_dist.to_msg(projected), don_sttl_receipt.to_msg(projected)],
  };
}
