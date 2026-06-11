import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import type { TAccount, TStatus } from "@/balance-txs";
import { numeric_as_number, timestamptz } from "./columns";
import { npos } from "./npo";

export const bal_txs = pgTable(
  "bal_txs",
  {
    id: text("id").primaryKey(),
    date_created: timestamptz("date_created").notNull(),
    date_updated: timestamptz("date_updated").notNull(),
    npo_id: integer("npo_id")
      .notNull()
      .references(() => npos.id),
    account: text("account").$type<TAccount>().notNull(),
    bal_begin: numeric_as_number("bal_begin", {
      precision: 38,
      scale: 18,
    }).notNull(),
    bal_end: numeric_as_number("bal_end", {
      precision: 38,
      scale: 18,
    }).notNull(),
    amount: numeric_as_number("amount", { precision: 38, scale: 18 }).notNull(),
    amount_units: numeric_as_number("amount_units", {
      precision: 38,
      scale: 18,
    }).notNull(),
    status: text("status").$type<TStatus>().notNull(),
    account_other_id: text("account_other_id"),
    account_other: text("account_other").$type<TAccount>(),
    account_other_bal_begin: numeric_as_number("account_other_bal_begin", {
      precision: 38,
      scale: 18,
    }),
    account_other_bal_end: numeric_as_number("account_other_bal_end", {
      precision: 38,
      scale: 18,
    }),
  },
  (t) => [
    check(
      "account_check",
      sql`${t.account} IN ('liq','lock','grant','donation','interest','dividend','refund')`
    ),
    check("status_check", sql`${t.status} IN ('pending','final','cancelled')`),
    index("bal_txs_status_date_idx").on(t.status, t.date_created),
    index("bal_txs_npo_id_account_date_idx").on(
      t.npo_id,
      t.account,
      t.date_created
    ),
    index("bal_txs_account_status_date_idx").on(
      t.account,
      t.status,
      t.date_created
    ),
    index("bal_txs_pending_idx")
      .on(t.date_created)
      .where(sql`${t.status} = 'pending'`),
  ]
);
