import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { numeric_as_number, timestamptz } from "./columns";

export const country_metrics = pgTable("country_metrics", {
  country_key: text("country_key").primaryKey(),
  name: text("name"),
  total_donations: numeric_as_number("total_donations", {
    precision: 38,
    scale: 18,
  }).default(0),
  total_donations_7d: numeric_as_number("total_donations_7d", {
    precision: 38,
    scale: 18,
  }).default(0),
  updated_at: timestamptz("updated_at"),
});

export const currency_rates = pgTable("currency_rates", {
  base_currency: text("base_currency").primaryKey(),
  rates: jsonb("rates").$type<Record<string, number> | null>(),
  updated_at: timestamptz("updated_at"),
});

export const config = pgTable("config", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
});
