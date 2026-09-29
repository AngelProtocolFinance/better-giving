import { min_payout_amount } from "@/npo/schema";
import { npo_default_bapp } from "$/pg/queries/banking";
import { npo_get } from "$/pg/queries/npo";

type Npo = NonNullable<Awaited<ReturnType<typeof npo_get>>>;

export type GrantEligibility =
  | { status: "not_found" }
  | { status: "skipped"; npo: Npo; minimum: number; reason: string }
  | { status: "pass"; npo: Npo; minimum: number; wise_id: string };

/** whether the grants run pays this npo's pending `total`; the schedule notice asks the same */
export async function grant_eligibility(
  npo_id: number,
  total: number
): Promise<GrantEligibility> {
  const npo = await npo_get(npo_id);
  if (!npo) return { status: "not_found" };
  const minimum = npo.payout_minimum ?? min_payout_amount;
  const skip = (reason: string) =>
    ({ status: "skipped", npo, minimum, reason }) as const;

  if (npo.active === false) return skip("inactive");
  const wise_id = await npo_default_bapp(npo.id).then((x) => x?.id);
  if (!wise_id) return skip("no wise recipient");
  if (total < minimum) {
    return skip(`payout minimum not met, min: ${minimum}, total: ${total}`);
  }
  return { status: "pass", npo, minimum, wise_id: String(wise_id) };
}
