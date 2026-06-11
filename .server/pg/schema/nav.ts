import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";
import { numeric_as_number, timestamptz } from "./columns";
import { tickers } from "./tickers";

export const nav_logs = pgTable("nav_logs", {
  date: timestamptz("date").primaryKey(),
  reason: text("reason").notNull(),
  units: numeric_as_number("units", { precision: 38, scale: 18 }).notNull(),
  price: numeric_as_number("price", { precision: 38, scale: 18 }).notNull(),
  price_updated: timestamptz("price_updated"),
  is_week: boolean("is_week").default(false),
  is_day: boolean("is_day").default(false),
});

export const nav_holders = pgTable(
  "nav_holders",
  {
    date: timestamptz("date")
      .notNull()
      .references(() => nav_logs.date, { onDelete: "cascade" }),
    npo_id: integer("npo_id").notNull(),
    units: numeric_as_number("units", { precision: 38, scale: 18 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.date, t.npo_id] }),
    index("nav_holders_npo_id_idx").on(t.npo_id),
  ]
);

export const nav_log_positions = pgTable(
  "nav_log_positions",
  {
    date: timestamptz("date")
      .notNull()
      .references(() => nav_logs.date, { onDelete: "cascade" }),
    ticker: text("ticker")
      .notNull()
      .references(() => tickers.id),
    qty: numeric_as_number("qty", { precision: 38, scale: 18 }).notNull(),
    price: numeric_as_number("price", { precision: 38, scale: 18 }).notNull(),
    value: numeric_as_number("value", { precision: 38, scale: 18 }).notNull(),
    price_date: timestamptz("price_date").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.date, t.ticker] }),
    index("nav_log_positions_ticker_idx").on(t.ticker, t.date.desc()),
    check("nav_log_positions_qty_nonneg", sql`${t.qty} >= 0`),
    check("nav_log_positions_price_nonneg", sql`${t.price} >= 0`),
    check(
      "nav_log_positions_value_eq_qty_price",
      sql`${t.value} = (${t.qty} * ${t.price})::numeric(38, 18)`
    ),
  ]
);
