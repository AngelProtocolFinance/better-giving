import type { ChariotMetadata, IDonation } from "@/donations";
import { amnt_sum } from "@/donations/helpers";
import { rd2num } from "@/helpers/decimal";
import { chariot } from "$/kit/chariot";
import { db } from "$/pg/db";
import { donation_put } from "$/pg/queries/donation";
import type { Provider } from "../types";

export const chariot_intent: Provider = async ({
  to,
  from,
  via,
  via_extra,
  intent,
}) => {
  const to_pay = amnt_sum(intent.amount);
  const grant = await chariot.create_grant({
    workflowSessionId: via_extra,
    amount: rd2num(to_pay * 100, 0), // in cents
  });

  const { don_id } = grant.metadata as unknown as ChariotMetadata;
  const now = new Date().toISOString();

  const r: IDonation = {
    id: don_id,
    status: "intent",
    via,
    via_extra: grant.id,
    upusd: 1, // chariot only supports usd
    created_at: now,
    updated_at: now,
    ...to,
    ...from,
    ...intent,
  };

  const don = await donation_put(db, r);
  return { don_id: don.id, body: { id: don.id } };
};
