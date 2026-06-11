import { openexchange } from "$/env";
import { currency_rates_put } from "$/pg/queries/country";

export async function index() {
  const res = await fetch(
    `https://openexchangerates.org/api/latest.json?app_id=${openexchange.app_id}&base=USD`
  );
  if (!res.ok) throw res;

  const { rates } = await res.json();

  // SLL is now SLE
  const { SLL, ...other_rates } = rates;

  const put = await currency_rates_put("USD", other_rates);
  console.info(put);
  return { statusCode: 200 };
}
