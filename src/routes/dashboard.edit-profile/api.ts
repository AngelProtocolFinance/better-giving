import type { ActionFunction } from "react-router";
import { user_ctx } from "#/.server/auth";
import { dataWithSuccess } from "#/.server/toast";
import { to_currencies_fv } from "#/helpers/currency";
import type { ICurrenciesFv } from "#/types/currency";
import type { IUserDb } from "@/users/schema";
import { stripe } from "$/kit/stripe";
import { currency_rates_get } from "$/pg/queries/country";
import { user_get, user_update } from "$/pg/queries/user";
import type { Route } from "./+types/route";

export interface LoaderData extends ICurrenciesFv {
  db_user: IUserDb;
}

export const loader = async ({ context }: Route.LoaderArgs) => {
  const user = context.get(user_ctx);
  const db_user = await user_get(user.email);
  if (!db_user) throw new Response("user not found", { status: 404 });

  const { supported_payment_currencies } =
    await stripe.countrySpecs.retrieve("US");

  const currencies_fv = to_currencies_fv(
    db_user.pref_currency,
    supported_payment_currencies,
    await currency_rates_get("USD").then(
      (x) => (x?.rates as Record<string, number>) ?? {}
    )
  );

  return { db_user, ...currencies_fv } satisfies LoaderData;
};

export const action: ActionFunction = async ({ request, context }) => {
  const user = context.get(user_ctx);
  const body = await request.json();

  await user_update(user.email, body);

  return dataWithSuccess(null, "User profile updated", {
    headers: { "x-remix-revalidate": "1" },
  });
};
