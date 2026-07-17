import { currency_rates_get } from "$/pg/queries/country";

/**
 * @param currency - lowercase iso4217 code
 * @returns number - amount/usd
 */
export const unit_per_usd = async (currency: string): Promise<number> => {
  const row = await currency_rates_get("USD");
  if (!row) throw { message: "Currency rates not found." };
  const rates = row.rates as Record<string, number>;
  const rate = rates[currency.toUpperCase()];

  if (!rate) throw { message: `Currency ${currency} not found.` };
  return rate;
};
