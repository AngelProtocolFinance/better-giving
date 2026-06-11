import type { LoaderFunction } from "react-router";
import { get_session } from "#/.server/auth";
import { to_currencies_fv } from "#/helpers/currency";
import { country_to_currency } from "@/constants/country-currency";
import { resp } from "@/helpers/https";
import { stripe } from "$/kit/stripe";
import { currency_rates_get } from "$/pg/queries/country";
import { user_get } from "$/pg/queries/user";

export const loader: LoaderFunction = async ({ request }) => {
  const { user } = await get_session(request);
  const country = request.headers.get("x-vercel-ip-country");

  const db_user = user ? await user_get(user.email) : undefined;
  const pref =
    db_user?.pref_currency ||
    (country ? country_to_currency[country] : undefined);

  const row = await currency_rates_get("USD");
  if (!row) throw new Response("Currency rates not found", { status: 500 });
  const all = row.rates as Record<string, number>;

  const { supported_payment_currencies } =
    await stripe.countrySpecs.retrieve("US");

  const r = to_currencies_fv(pref, supported_payment_currencies, all);
  return resp.json(r);
};
