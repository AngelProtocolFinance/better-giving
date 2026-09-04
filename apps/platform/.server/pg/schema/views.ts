import { sql } from "drizzle-orm";
import { bigint, integer, pgView, text } from "drizzle-orm/pg-core";
import { numeric_as_number } from "./columns";

// per-npo revenue totals by type
export const v_rev_ltd = pgView("v_rev_ltd", {
  npo_id: integer("npo_id"),
  type: text("type"),
  total: numeric_as_number("total", { precision: 38, scale: 18 }),
}).as(
  sql`SELECT npo_id, type, SUM(revenue) as total FROM rev_logs WHERE status = 'final' AND npo_id IS NOT NULL GROUP BY npo_id, type`
);

// per-npo loss totals
export const v_loss_ltd = pgView("v_loss_ltd", {
  npo_id: integer("npo_id"),
  total: numeric_as_number("total", { precision: 38, scale: 18 }),
}).as(sql`SELECT npo_id, SUM(amount) as total FROM loss_logs GROUP BY npo_id`);

// per-npo settled contribution total and count
export const v_contributions = pgView("v_contributions", {
  npo_id: integer("npo_id"),
  total: numeric_as_number("total", { precision: 38, scale: 18 }),
  count: bigint("count", { mode: "number" }),
}).as(
  sql`SELECT to_id as npo_id, COALESCE(SUM(amount_usd), 0) as total, COUNT(*) as count FROM dists WHERE status = 'settled' GROUP BY to_id`
);

// per-fund settled donation total, net (after fees)
export const v_donation_total_usd = pgView("v_donation_total_usd", {
  fund_id: text("fund_id"),
  total: numeric_as_number("total", { precision: 38, scale: 18 }),
}).as(
  sql`SELECT fund_id, COALESCE(SUM(net), 0) as total FROM dists WHERE fund_id IS NOT NULL AND status = 'settled' GROUP BY fund_id`
);

// lifetime payouts per referrer
export const v_referrer_payout_ltd = pgView("v_referrer_payout_ltd", {
  referrer: text("referrer"),
  total: numeric_as_number("total", { precision: 38, scale: 18 }),
}).as(
  sql`SELECT COALESCE(referrer_user, referrer_npo) as referrer, SUM(amount) as total FROM referrer_payouts GROUP BY COALESCE(referrer_user, referrer_npo)`
);

// lifetime commissions per referrer and npo
export const v_referrer_commissions_ltd = pgView("v_referrer_commissions_ltd", {
  referrer: text("referrer"),
  npo_id: integer("npo_id"),
  total: numeric_as_number("total", { precision: 38, scale: 18 }),
}).as(
  sql`SELECT COALESCE(referrer_user, referrer_npo) as referrer, npo_id, SUM(amount) as total FROM referrer_commissions WHERE status = 'paid' GROUP BY COALESCE(referrer_user, referrer_npo), npo_id`
);
