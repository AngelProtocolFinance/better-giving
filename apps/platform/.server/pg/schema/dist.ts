import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { IAllocation } from "@/donations";
import { numeric_as_number, timestamptz } from "./columns";
import { donations } from "./donation";
import { npos } from "./npo";

export const DISTS_DONATION_ID_TO_ID_UNIQ = "dists_donation_id_to_id_uniq";

export const dists = pgTable(
  "dists",
  {
    id: text("id").primaryKey(),
    donation_id: text("donation_id")
      .notNull()
      .references(() => donations.id),
    status: text("status")
      .$type<"settled" | "refunded" | "refunded_loss">()
      .notNull(),
    date_created: timestamptz("date_created").notNull(),
    to_id: integer("to_id").references(() => npos.id),
    to_name: text("to_name"),
    to_fiscal_sponsored: boolean("to_fiscal_sponsored"),
    amount: numeric_as_number("amount", { precision: 38, scale: 18 }),
    amount_usd: numeric_as_number("amount_usd", { precision: 38, scale: 18 }),
    amount_denom: text("amount_denom").notNull(),
    net: numeric_as_number("net", { precision: 38, scale: 18 }),
    fee_base: numeric_as_number("fee_base", { precision: 38, scale: 18 }),
    fee_fsa: numeric_as_number("fee_fsa", { precision: 38, scale: 18 }),
    fee_processing: numeric_as_number("fee_processing", {
      precision: 38,
      scale: 18,
    }),
    fee_allowance: numeric_as_number("fee_allowance", {
      precision: 38,
      scale: 18,
    }),
    fee_allowance_excess: numeric_as_number("fee_allowance_excess", {
      precision: 38,
      scale: 18,
    }),
    fund_id: text("fund_id"),
    alloc: jsonb("alloc").$type<IAllocation | null>(),
    refund_status: text("refund_status").$type<
      "completed" | "failed" | "loss"
    >(),
    refund_error: text("refund_error"),
    // the npo notice runs under one lease (`notice_claimed_at`) with a stamp
    // per side effect — npo mail, country metric, zapier hooks — so each runs
    // once and a failed one is retried alone; see `claim_dist_notice`
    notice_claimed_at: timestamptz("notice_claimed_at"),
    notice_sent_at: timestamptz("notice_sent_at"),
    metric_counted_at: timestamptz("metric_counted_at"),
    hooks_sent_at: timestamptz("hooks_sent_at"),
    /** the connected account (`acct_…`) settlement routed this dist to; null when pooled */
    stripe_routed_to: text("stripe_routed_to"),
    /** the stripe transfer that paid this dist to the npo's connected account */
    stripe_transfer_id: text("stripe_transfer_id"),
    /** the share of the charge its refunds had already taken when a refused
     * transfer rebooked it pooled. a partial cut reduces `net` to what was
     * booked; a total cut leaves the settled `net` and books nothing. null
     * when nothing was cut */
    refunds_cut_share: numeric_as_number("refunds_cut_share", {
      precision: 38,
      scale: 18,
    }),
  },
  (t) => [
    check(
      "dists_status_check",
      sql`${t.status} IN ('settled','refunded','refunded_loss')`
    ),
    // a transfer pays a routed dist only; refunds trust routed_to to reverse it
    check(
      "dists_transfer_routed_check",
      sql`${t.stripe_transfer_id} IS NULL OR ${t.stripe_routed_to} IS NOT NULL`
    ),
    check(
      "dists_refunds_cut_share_check",
      sql`${t.refunds_cut_share} > 0 AND ${t.refunds_cut_share} <= 1`
    ),
    index("dists_donation_id_idx").on(t.donation_id),
    index("dists_to_id_date_idx").on(t.to_id, t.date_created),
    // covers npo-scoped settled-only joins to donation_donors (donor list/summary)
    index("dists_to_id_settled_donation_idx")
      .on(t.to_id, t.donation_id)
      .where(sql`${t.status} = 'settled'`),
    // idempotency: one dist per parent donation per npo
    unique(DISTS_DONATION_ID_TO_ID_UNIQ).on(t.donation_id, t.to_id),
    // partial: a pooled dist has no transfer and never touches the index
    uniqueIndex("dists_stripe_transfer_id_uniq")
      .on(t.stripe_transfer_id)
      .where(sql`${t.stripe_transfer_id} IS NOT NULL`),
  ]
);
