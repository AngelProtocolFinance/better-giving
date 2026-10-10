import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { numeric_as_number, timestamptz } from "./columns";
import { funds } from "./fund";
import { npos } from "./npo";

export const rev_logs = pgTable(
  "rev_logs",
  {
    id: text("id").primaryKey(),
    date: timestamptz("date").notNull(),
    donation_id: text("donation_id").notNull(),
    npo_id: integer("npo_id").references(() => npos.id),
    fund_id: text("fund_id").references(() => funds.id),
    npo_name: text("npo_name"),
    type: text("type").$type<"tip" | "base-fee" | "fsa-fee">().notNull(),
    gross: numeric_as_number("gross", { precision: 38, scale: 18 }).notNull(),
    commission: numeric_as_number("commission", {
      precision: 38,
      scale: 18,
    }).notNull(),
    revenue: numeric_as_number("revenue", {
      precision: 38,
      scale: 18,
    }).notNull(),
    status: text("status")
      .$type<"final" | "refunded" | "refunded_loss">()
      .notNull(),
    type_tip: jsonb("type_tip").$type<{
      denom: string;
      input: number;
      input_usd: number;
      fa_excess: number;
      pf: number;
    }>(),
  },
  (t) => [
    check(
      "rev_logs_type_check",
      sql`${t.type} IN ('tip','base-fee','fsa-fee')`
    ),
    check(
      "rev_logs_status_check",
      sql`${t.status} IN ('final','refunded','refunded_loss')`
    ),
    index("rev_logs_date_idx").on(t.date),
    index("rev_logs_type_date_idx").on(t.type, t.date),
  ]
);

export const loss_logs = pgTable(
  "loss_logs",
  {
    id: text("id").primaryKey(),
    date: timestamptz("date").notNull(),
    donation_id: text("donation_id").notNull(),
    /** null on a write-off, which is of an owed row, not of one dist */
    dist_id: text("dist_id"),
    /** whose loss: an npo, or on a write-off of a referrer's owed row, that referrer */
    npo_id: integer("npo_id").references(() => npos.id),
    referrer_user: text("referrer_user").references(() => user.referral_code),
    referrer_npo: text("referrer_npo").references(() => npos.referral_id),
    type: text("type")
      .$type<"balance_liq" | "balance_lock" | "payout" | "write_off">()
      .notNull(),
    amount: numeric_as_number("amount", { precision: 38, scale: 18 }).notNull(),
    npo_amount: numeric_as_number("npo_amount", {
      precision: 38,
      scale: 18,
    }).notNull(),
    fees_bg: numeric_as_number("fees_bg", {
      precision: 38,
      scale: 18,
    }).notNull(),
    fees_processing: numeric_as_number("fees_processing", {
      precision: 38,
      scale: 18,
    }).notNull(),
    reason: text("reason").notNull(),
    /** the admin who wrote it off */
    actor: text("actor").references(() => user.id),
  },
  (t) => [
    check(
      "loss_logs_type_check",
      sql`${t.type} IN ('balance_liq','balance_lock','payout','write_off')`
    ),
    check(
      "loss_logs_party_xor",
      sql`num_nonnulls(${t.npo_id}, ${t.referrer_user}, ${t.referrer_npo}) = 1`
    ),
    check(
      "loss_logs_write_off_check",
      sql`CASE WHEN ${t.type} = 'write_off' THEN ${t.actor} IS NOT NULL ELSE ${t.dist_id} IS NOT NULL END`
    ),
    index("loss_logs_date_idx").on(t.date),
    index("loss_logs_npo_id_idx").on(t.npo_id),
  ]
);
