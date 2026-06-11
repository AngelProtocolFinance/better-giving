import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";
import { numeric_as_number, timestamptz } from "./columns";
import { npos } from "./npo";
import { tickers } from "./tickers";

export const bal_logs = pgTable("bal_logs", {
  date: timestamptz("date").primaryKey(),
});

export const bal_log_entries = pgTable(
  "bal_log_entries",
  {
    date: timestamptz("date")
      .notNull()
      .references(() => bal_logs.date, { onDelete: "cascade" }),
    npo_id: integer("npo_id")
      .notNull()
      .references(() => npos.id),
    balance: numeric_as_number("balance", {
      precision: 38,
      scale: 18,
    }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.date, t.npo_id] }),
    index("bal_log_entries_npo_idx").on(t.npo_id, t.date.desc()),
    check("bal_log_entries_balance_nonneg", sql`${t.balance} >= 0`),
  ]
);

export const intr_logs = pgTable("intr_logs", {
  id: text("id").primaryKey(),
  date_created: timestamptz("date_created").notNull(),
  total: numeric_as_number("total", { precision: 38, scale: 18 }).notNull(),
  date_start: timestamptz("date_start").notNull(),
  date_end: timestamptz("date_end").notNull(),
  alloc: jsonb("alloc").$type<Record<string, number>>().notNull(),
});

export const dividend_logs = pgTable("dividend_logs", {
  id: text("id").primaryKey(),
  date_created: timestamptz("date_created").notNull(),
  amount_usd: numeric_as_number("amount_usd", {
    precision: 38,
    scale: 18,
  }).notNull(),
  amount_units: numeric_as_number("amount_units", {
    precision: 38,
    scale: 18,
  }).notNull(),
  per_npo_units: jsonb("per_npo_units")
    .$type<Record<string, number>>()
    .notNull(),
});

export const rebalance_logs = pgTable("rebalance_logs", {
  id: text("id").primaryKey(),
  date: timestamptz("date"),
});

export const rebalance_log_txs = pgTable(
  "rebalance_log_txs",
  {
    rebalance_log_id: text("rebalance_log_id")
      .notNull()
      .references(() => rebalance_logs.id, { onDelete: "cascade" }),
    tx_id: text("tx_id").notNull(),
    in_id: text("in_id")
      .notNull()
      .references(() => tickers.id),
    out_id: text("out_id")
      .notNull()
      .references(() => tickers.id),
    in_qty: numeric_as_number("in_qty", {
      precision: 38,
      scale: 18,
    }).notNull(),
    out_qty: numeric_as_number("out_qty", {
      precision: 38,
      scale: 18,
    }).notNull(),
    price: numeric_as_number("price", {
      precision: 38,
      scale: 18,
    }).notNull(),
    fee: numeric_as_number("fee", { precision: 38, scale: 18 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.rebalance_log_id, t.tx_id] }),
    check("rebalance_log_txs_in_qty_gt0", sql`${t.in_qty} > 0`),
    check("rebalance_log_txs_out_qty_gt0", sql`${t.out_qty} > 0`),
    check("rebalance_log_txs_price_gt0", sql`${t.price} > 0`),
    check("rebalance_log_txs_fee_nonneg", sql`${t.fee} >= 0`),
    check("rebalance_log_txs_distinct", sql`${t.in_id} <> ${t.out_id}`),
    check(
      "rebalance_log_txs_cash_side",
      sql`'CASH' IN (${t.in_id}, ${t.out_id})`
    ),
  ]
);

export const rebalance_log_bals = pgTable(
  "rebalance_log_bals",
  {
    rebalance_log_id: text("rebalance_log_id")
      .notNull()
      .references(() => rebalance_logs.id, { onDelete: "cascade" }),
    ticker: text("ticker")
      .notNull()
      .references(() => tickers.id),
    balance: numeric_as_number("balance", {
      precision: 38,
      scale: 18,
    }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.rebalance_log_id, t.ticker] }),
    check("rebalance_log_bals_nonneg", sql`${t.balance} >= 0`),
  ]
);
