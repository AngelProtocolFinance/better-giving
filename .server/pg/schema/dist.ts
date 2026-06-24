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
} from "drizzle-orm/pg-core";
import type { IAllocation } from "@/donations";
import { numeric_as_number, timestamptz } from "./columns";
import { donations } from "./donation";
import { npos } from "./npo";

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
    to_claimed: boolean("to_claimed"),
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
  },
  (t) => [
    check(
      "dists_status_check",
      sql`${t.status} IN ('settled','refunded','refunded_loss')`
    ),
    index("dists_donation_id_idx").on(t.donation_id),
    index("dists_to_id_date_idx").on(t.to_id, t.date_created),
    // covers npo-scoped settled-only joins to donation_donors (donor list/summary)
    index("dists_to_id_settled_donation_idx")
      .on(t.to_id, t.donation_id)
      .where(sql`${t.status} = 'settled'`),
    // idempotency: one dist per parent donation per npo
    unique("dists_donation_id_to_id_uniq").on(t.donation_id, t.to_id),
  ]
);
