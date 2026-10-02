import { ChariotError } from "@better-giving/chariot";
import { report_degraded } from "#/errors/report";
import { MIN_DONATION_USD } from "@/constants/common";
import type { ChariotMetadata, IDonation } from "@/donations";
import { amnt_sum } from "@/donations/helpers";
import { snap } from "@/helpers/decimal";
import { resp } from "@/helpers/https";
import { chariot } from "$/kit/chariot";
import { db } from "$/pg/db";
import { is_unique_violation } from "$/pg/errors";
import { donation_get, donation_put } from "$/pg/queries/donation";
import type { Provider } from "../types";

/** create grant answers these having made no grant, so the donor can go again.
 * not 409: that's this session's grant already processing, so one may exist */
const NO_GRANT = new Set([400, 404, 410]);
// chariot's own reason can be about our key or config, so it goes to the report
const NO_GRANT_MSG =
  "Your fund couldn't make this grant. Please check the amount and try again.";

export const chariot_intent: Provider = async ({
  to,
  from,
  via,
  via_extra,
  intent,
}) => {
  // chariot is usd-only; upusd = 1 so base_usd === intent.amount.base
  if (intent.amount.base < MIN_DONATION_USD)
    return resp.txt(
      `The minimum DAF donation is ${MIN_DONATION_USD} USD.`,
      400
    );

  // dafs grant whole dollars only; chariot 400s anything else after the donor
  // has already authorized, so it's refused here with a message they can read
  const dollars = snap(amnt_sum(intent.amount));
  if (!Number.isInteger(dollars))
    return resp.txt("DAF grants must be a whole dollar amount", 400);

  const grant = await chariot
    .create_grant({ workflowSessionId: via_extra, amount: dollars * 100 })
    .catch((err) => {
      if (!(err instanceof ChariotError) || !NO_GRANT.has(err.http_status))
        throw err;
      return err;
    });
  if (grant instanceof ChariotError) {
    report_degraded(grant, {
      status: grant.http_status,
      request_id: grant.request_id,
      reason: grant.reason,
    });
    return resp.txt(NO_GRANT_MSG, grant.http_status);
  }

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

  const don = await db
    .transaction((tx) => donation_put(tx, r))
    .catch(async (err) => {
      if (!is_unique_violation(err, "donations_pkey")) throw err;
      // create grant answers a repeat for the same workflow session with the
      // same grant, so a row for it means an earlier request already recorded it
      const prior = await donation_get(don_id);
      if (prior?.via_extra !== grant.id) throw err;
      return prior;
    });
  return { don_id: don.id, body: { id: don.id } };
};
