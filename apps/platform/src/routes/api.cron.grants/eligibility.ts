import { min_payout_amount } from "@/npo/schema";
import { payout_total } from "$/payouts/transfer";
import { npo_default_bapp } from "$/pg/queries/banking";
import { npo_get } from "$/pg/queries/npo";

type Npo = NonNullable<Awaited<ReturnType<typeof npo_get>>>;

export type GrantEligibility =
  | { status: "not_found"; total: number }
  | {
      status: "skipped";
      npo: Npo;
      minimum: number;
      total: number;
      reason: string;
    }
  | {
      status: "pass";
      npo: Npo;
      minimum: number;
      total: number;
      wise_id: string;
    };

/**
 * whether the grants run pays this npo its pending `amounts`, judged on their
 * `total`: the cents the run sends. the schedule notice asks the same
 */
export async function grant_eligibility(
  npo_id: number,
  amounts: number[]
): Promise<GrantEligibility> {
  const total = payout_total(amounts);
  const npo = await npo_get(npo_id);
  if (!npo) return { status: "not_found", total };
  const minimum = npo.payout_minimum ?? min_payout_amount;
  const skip = (reason: string) =>
    ({ status: "skipped", npo, minimum, total, reason }) as const;

  if (npo.active === false) return skip("inactive");
  const wise_id = await npo_default_bapp(npo.id).then((x) => x?.id);
  if (!wise_id) return skip("no wise recipient");
  if (total < minimum) {
    return skip(`payout minimum not met, min: ${minimum}, total: ${total}`);
  }
  return { status: "pass", npo, minimum, total, wise_id: String(wise_id) };
}
