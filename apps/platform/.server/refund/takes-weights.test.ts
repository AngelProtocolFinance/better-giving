import { describe, expect, test } from "vitest";
import type { ITake } from "../pg/queries/take";
import type { LockedDist } from "./share";
import { owed_targets } from "./takes";

const locked = (
  over: Pick<LockedDist, "id" | "to_id" | "net"> & Partial<LockedDist>
): LockedDist => ({
  status: "settled",
  refund_status: null,
  to_name: `NPO ${over.to_id}`,
  fee_base: 0,
  fee_fsa: 0,
  fee_processing: 0,
  fee_allowance: 0,
  cash_pct: 0,
  routed: false,
  refunds_cut_share: null,
  settled_net: null,
  payout_type: null,
  commission: {
    amount: 0,
    status: "refunded",
    referrer_user: null,
    referrer_npo: null,
  },
  ...over,
});

const dispute = (fee_usd: number): ITake => ({
  id: "take-1",
  donation_id: "don-1",
  ref: "dp_1",
  kind: "dispute",
  share: 1,
  fee_usd,
  status: "active",
  dispute_id: "dp_1",
  chargeback_ref: null,
  refunded_at: null,
  created_at: "2026-10-14T00:00:00.000Z",
});

describe("owed_targets", () => {
  // rebuilding 33.33 / (2/3) would weigh $49.99 and move $0.01 of the fee
  test("a one-third cut splits a dispute fee on the stored settled net", () => {
    const targets = owed_targets(
      [
        locked({
          id: "a",
          to_id: 1,
          net: 33.33,
          refunds_cut_share: 1 / 3,
          settled_net: 50,
        }),
        locked({ id: "b", to_id: 2, net: 50 }),
      ],
      [dispute(15)]
    );

    expect(targets.get(JSON.stringify({ npo_id: 1 }))?.fee_dispute_usd).toBe(
      7.5
    );
    expect(targets.get(JSON.stringify({ npo_id: 2 }))?.fee_dispute_usd).toBe(
      7.5
    );
  });
});
