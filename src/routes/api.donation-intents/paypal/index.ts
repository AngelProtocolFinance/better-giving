import { unit_per_usd } from "#/.server/unit-per-usd";
import { MIN_DONATION_USD } from "@/constants/common";
import type { IDonation } from "@/donations";
import { rd2num } from "@/helpers/decimal";
import { resp } from "@/helpers/https";
import { db } from "$/pg/db";
import { donation_put } from "$/pg/queries/donation";
import type { Provider } from "../types";
import { create_order } from "./create-order";
import { create_subs } from "./create-subs";

export const paypal_intent: Provider = async ({ to, from, intent }) => {
  const upusd = await unit_per_usd(intent.currency);
  const base_usd = rd2num(intent.amount.base / upusd, 1);
  if (base_usd < MIN_DONATION_USD) return resp.status(400, "less than min");

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
