import { unit_per_usd } from "#/.server/unit-per-usd";
import { MIN_DONATION_USD } from "@/constants/common";
import type { IDonation, IStripeIntentReturn } from "@/donations";
import { rd2num } from "@/helpers/decimal";
import { resp } from "@/helpers/https";
import { db } from "$/pg/db";
import { donation_put } from "$/pg/queries/donation";
import type { Provider } from "../types";
import { customer_with_currency } from "./customer-with-currency";
import { payment_intent } from "./payment-intent";
import { setup_intent } from "./setup-intent";

export const stripe_intent: Provider = async ({
  to,
  from,
  donor,
  via,
  intent,
}) => {
  const upusd = await unit_per_usd(intent.currency);
  const base_usd = rd2num(intent.amount.base / upusd, 1);
  if (base_usd < MIN_DONATION_USD) return resp.status(400, "less than min");

  const customer_id = await customer_with_currency(
    intent.currency,
    donor.email
  );

  const r_id = crypto.randomUUID();
  const now = new Date().toISOString();
  const r: IDonation = {
    id: r_id,
    status: "created",
    via: "stripe",
    upusd,
    created_at: now,
    updated_at: now,
    ...to,
    ...from,
    ...intent,
  };
  const don = await donation_put(db, r);

  const bank_only = via === "bank";
  let client_secret: string;
  if (intent.frequency === "one-time") {
    client_secret = await payment_intent({
      ...don.amount,
      currency: don.currency,
      customer_id,
      order_id: don.id,
      bank_only,
    });
  } else {
    client_secret = await setup_intent(don.id, customer_id, bank_only);
  }

  const body: IStripeIntentReturn = {
    client_secret,
    order_id: don.id,
  };
  return { don_id: don.id, body };
};
