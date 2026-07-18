import type { IDividendSimulComps, ILog } from "@/nav";

/**
 * @param amount total dividend amount in usd
 */
export const npo_dividend_comps = async (
  amount_usd: number,
  nav_ltd: ILog
): Promise<IDividendSimulComps> => {
  const purchased_units = amount_usd / nav_ltd.price;
  const per_npo_units: Record<string, number> = {};
  const per_npo_usd: Record<string, number> = {};

  for (const [npo, npo_holding] of Object.entries(nav_ltd.holders)) {
    const to_credit_units = purchased_units * (npo_holding / nav_ltd.units);
    if (to_credit_units === 0) continue;

    per_npo_units[npo] = to_credit_units;
    per_npo_usd[npo] = to_credit_units * nav_ltd.price;
  }

  return {
    purchased_units,
    per_npo_units,
    per_npo_usd,
  };
};
