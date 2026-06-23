import { unit_per_usd } from "#/.server/unit-per-usd";
import type { IDonation } from "@/donations";
import { db } from "$/pg/db";
import { donation_put } from "$/pg/queries/donation";
import type { Provider } from "../types";
import { create_order } from "./create-order";
import { create_subs } from "./create-subs";

export const paypal_intent: Provider = async ({ to, from, intent }) => {
  const upusd = await unit_per_usd(intent.currency);
  const r_id = crypto.randomUUID();
  const now = new Date().toISOString();
  const r: IDonation = {
    id: r_id,
    status: "created",
    via: "paypal",
    upusd,
    created_at: now,
    updated_at: now,
    ...to,
    ...from,
    ...intent,
  };
  const don = await donation_put(db, r);

  let tx_id: string;
  if (intent.frequency === "one-time") {
    tx_id = await create_order({
      order_id: don.id,
      currency: don.currency,
      npo_name: to.to_name,
      ...don.amount,
    });
  } else {
    tx_id = await create_subs({
      ...don.amount,
      order_id: don.id,
      freq: intent.frequency,
      currency: don.currency,
    });
  }

  return { don_id: don.id, body: { tx_id, don_id: don.id } };
};
