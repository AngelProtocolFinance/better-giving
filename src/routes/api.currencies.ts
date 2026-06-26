import type { LoaderFunction } from "react-router";
import { to_currencies_fv } from "#/helpers/currency";
import { country_to_currency } from "@/constants/country-currency";
import { resp } from "@/helpers/https";
import { stripe } from "$/kit/stripe";
import { currency_rates_get } from "$/pg/queries/country";

const cache = "public, s-maxage=300, stale-while-revalidate=3600";

export const loader: LoaderFunction = async ({ request }) => {
  const country = request.headers.get("x-vercel-ip-country");
  const pref = country ? country_to_currency[country] : undefined;

  const row = await currency_rates_get("USD");
  if (!row) throw new Response("Currency rates not found", { status: 500 });
  const all = row.rates as Record<string, number>;

  const { supported_payment_currencies } =
    await stripe.countrySpecs.retrieve("US");

  const r = to_currencies_fv(pref, supported_payment_currencies, all);
  // response depends only on geo, so it is shared at the CDN keyed by country
  return resp.json(r, 200, {
    "cache-control": cache,
    vary: "x-vercel-ip-country",
  });
};
