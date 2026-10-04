import { snap } from "@/helpers/decimal";
import { payout_total } from "./transfer";

/** one gift's row the npo still owes on, or is due back from when negative */
export interface IOwedOutstanding {
  donation_id: string;
  outstanding_usd: number;
}

export interface IRecovery {
  donation_id: string;
  usd: number;
}

export type NetPlan =
  | {
      status: "pay";
      gross: number;
      net: number;
      recovered: IRecovery[];
      repaid: IRecovery[];
    }
  | {
      status: "recover_only";
      gross: number;
      recovered: IRecovery[];
      repaid: IRecovery[];
    }
  | { status: "under_minimum"; gross: number; net: number; minimum: number };

/**
 * what a grant run pays an npo whose pending payouts total `gross` (the cents
 * the run sends), given its `owed` rows oldest gift first. the minimum is
 * checked on the net. owing at least what the run has to give takes all of it
 * with no transfer, the rest still owed
 */
export function net_owed(
  gross: number,
  owed: IOwedOutstanding[],
  minimum: number
): NetPlan {
  const owing = owed.filter((o) => o.outstanding_usd > 0);
  const repaid = owed
    .filter((o) => o.outstanding_usd < 0)
    .map((o) => ({ donation_id: o.donation_id, usd: -o.outstanding_usd }));
  const net = payout_total([gross, ...owed.map((o) => -o.outstanding_usd)]);
  if (net <= 0) {
    const available = gross + repaid.reduce((a, r) => a + r.usd, 0);
    const recovered = take(owing, snap(available));
    return { status: "recover_only", gross, recovered, repaid };
  }
  if (net < minimum) return { status: "under_minimum", gross, net, minimum };
  const recovered = take(owing, Infinity);
  return { status: "pay", gross, net, recovered, repaid };
}

/** up to `usd` from the rows, in the order given */
function take(owing: IOwedOutstanding[], usd: number): IRecovery[] {
  const recovered: IRecovery[] = [];
  let left = usd;
  for (const o of owing) {
    if (left <= 0) break;
    const take = Math.min(o.outstanding_usd, left);
    recovered.push({ donation_id: o.donation_id, usd: take });
    left = snap(left - take);
  }
  return recovered;
}
