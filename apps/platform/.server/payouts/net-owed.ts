import { snap, to_units } from "@/helpers/decimal";

/** one gift's row the npo still owes on, or is due back from when negative */
export interface IOwedOutstanding {
  donation_id: string;
  /** a generated column, typed nullable; its inputs never are */
  outstanding_usd: number | null;
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
  | {
      status: "under_minimum";
      gross: number;
      net: number;
      minimum: number;
      /** what the net was judged on, none of it taken: a due-back negative */
      deductions: IRecovery[];
    };

/**
 * what a grant run pays an npo whose pending payouts total `gross` (the cents
 * the run sends), given its `owed` rows oldest gift first. each row counts to
 * the cent below, so what is recovered is what the transfer withholds and a
 * sub-cent remainder stays owed. the minimum is checked on the net. owing at
 * least what the run has to give takes all of it with no transfer, the rest
 * still owed
 */
export function net_owed(
  gross: number,
  owed: IOwedOutstanding[],
  minimum: number
): NetPlan {
  const owing = in_cents(owed, 1);
  const due = in_cents(owed, -1);
  const repaid = due.map(as_usd);
  const gross_cents = to_units(gross, 2);
  const due_cents = sum(due);
  const net_cents = gross_cents + due_cents - sum(owing);
  if (net_cents <= 0 && owing.length > 0) {
    const recovered = take(owing, gross_cents + due_cents).map(as_usd);
    return { status: "recover_only", gross, recovered, repaid };
  }
  const net = net_cents / 100;
  if (net < minimum) {
    const deductions = [
      ...owing.map(as_usd),
      ...repaid.map((r) => ({ ...r, usd: -r.usd })),
    ];
    return { status: "under_minimum", gross, net, minimum, deductions };
  }
  return { status: "pay", gross, net, recovered: owing.map(as_usd), repaid };
}

interface ICents {
  donation_id: string;
  cents: number;
}

/** the rows owing (`sign` 1) or due back (-1), each in whole cents toward
 * zero, a row under a cent left out */
function in_cents(owed: IOwedOutstanding[], sign: 1 | -1): ICents[] {
  return owed
    .map((o) => ({
      donation_id: o.donation_id,
      cents: Math.floor(snap(sign * (o.outstanding_usd ?? 0) * 100)),
    }))
    .filter((o) => o.cents > 0);
}

const sum = (rows: ICents[]) => rows.reduce((a, r) => a + r.cents, 0);

const as_usd = (r: ICents): IRecovery => ({
  donation_id: r.donation_id,
  usd: r.cents / 100,
});

/** up to `cents` from the rows, in the order given */
function take(owing: ICents[], cents: number): ICents[] {
  const taken: ICents[] = [];
  let left = cents;
  for (const o of owing) {
    if (left <= 0) break;
    const take = Math.min(o.cents, left);
    taken.push({ donation_id: o.donation_id, cents: take });
    left -= take;
  }
  return taken;
}
