import type { Nowpayments } from "./index";

/** bg's own floor; raises a pair minimum that's lower */
const BG_MIN_USD = 1;
/**
 * 3% allowance:
 * - 0.5% fee
 * - 2.5% spread between our quote and nowpayments' conversion of it
 */
const SPREAD_ALLOWANCE = 1.03;

export interface IDonationQuote {
  /** units of the token: the pair minimum, raised to the bg floor */
  floor: number;
  /** units of the token: `floor` plus the spread allowance; what a donor must enter */
  min: number;
  /** usd per unit of the token, fees excluded */
  usdpu: number;
}

export async function donation_quote(
  np: Pick<Nowpayments, "min_amount" | "estimate">,
  token_code: string
): Promise<IDonationQuote> {
  const [{ min, min_usd }, { usdpu }] = await Promise.all([
    np.min_amount(token_code),
    np.estimate(token_code),
  ]);
  const floor = min_usd >= BG_MIN_USD ? min : (BG_MIN_USD * min) / min_usd;
  return { floor, min: floor * SPREAD_ALLOWANCE, usdpu };
}
