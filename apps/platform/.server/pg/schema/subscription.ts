import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { numeric_as_number, timestamptz } from "./columns";
import { funds } from "./fund";
import { npos } from "./npo";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    interval: text("interval")
      .$type<"day" | "month" | "week" | "year">()
      .notNull(),
    interval_count: integer("interval_count").notNull(),
    next_billing: timestamptz("next_billing").notNull(),
    amount: numeric_as_number("amount", { precision: 38, scale: 18 }).notNull(),
    amount_usd: numeric_as_number("amount_usd", {
      precision: 38,
      scale: 18,
    }).notNull(),
    currency: text("currency").notNull(),
    product_id: text("product_id").notNull(),
    to_npo_id: integer("to_npo_id").references(() => npos.id),
    to_fund_id: text("to_fund_id").references(() => funds.id),
    to_name: text("to_name").notNull(),
    platform: text("platform").$type<"stripe" | "paypal">().notNull(),
    status: text("status").$type<"active" | "inactive">().notNull(),
    status_cancel_reason: text("status_cancel_reason"),
    from_id: text("from_id").notNull(),
    created_at: timestamptz("created_at").notNull(),
    updated_at: timestamptz("updated_at").notNull(),
  },
  (t) => [
    check(
      "interval_check",
      sql`${t.interval} IN ('day','month','week','year')`
    ),
    check(
      "recipient_xor",
      sql`num_nonnulls(${t.to_npo_id}, ${t.to_fund_id}) = 1`
    ),
    check("platform_check", sql`${t.platform} IN ('stripe','paypal')`),
    check("status_check", sql`${t.status} IN ('active','inactive')`),
    index("subscriptions_from_id_status_idx").on(
      t.from_id,
      t.status,
      t.created_at
    ),
    index("subscriptions_active_idx")
      .on(t.from_id, t.created_at)
      .where(sql`${t.status} = 'active'`),
    index("subscriptions_to_npo_id_status_idx").on(
      t.to_npo_id,
      t.status,
      t.created_at
    ),
  ]
);
