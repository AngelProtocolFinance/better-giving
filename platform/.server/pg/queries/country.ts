import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { config, country_metrics, currency_rates } from "../schema/country";
import type { DbOrTx } from "./helpers";

type CountryMetric = typeof country_metrics.$inferSelect;

// -- country metrics --

export async function country_metrics_time_get(): Promise<number | undefined> {
  const [row] = await db
    .select()
    .from(config)
    .where(eq(config.key, "country_metrics_time"));
  return (row?.value as { week_num: number } | undefined)?.week_num;
}

export async function countries_query(): Promise<CountryMetric[]> {
  return db
    .select()
    .from(country_metrics)
    .orderBy(desc(country_metrics.total_donations));
}

export async function country_update(
  db: DbOrTx,
  r: {
    country_key: string;
    country_name: string;
    inc_amount: number;
    is_new_week: boolean;
  }
) {
  await db
    .insert(country_metrics)
    .values({
      country_key: r.country_key,
      name: r.country_name,
      total_donations: r.inc_amount,
      total_donations_7d: r.inc_amount,
      updated_at: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: country_metrics.country_key,
      set: {
        name: r.country_name,
        total_donations: sql`${country_metrics.total_donations} + ${r.inc_amount}`,
        total_donations_7d: r.is_new_week
          ? r.inc_amount
          : sql`${country_metrics.total_donations_7d} + ${r.inc_amount}`,
        updated_at: new Date().toISOString(),
      },
    });
}

export async function country_time_update(db: DbOrTx, week_num: number) {
  await db
    .insert(config)
    .values({ key: "country_metrics_time", value: { week_num } })
    .onConflictDoUpdate({
      target: config.key,
      set: { value: { week_num } },
    });
}

// -- currency rates --

export async function currency_rates_get(
  base: string
): Promise<typeof currency_rates.$inferSelect | undefined> {
  const [row] = await db
    .select()
    .from(currency_rates)
    .where(eq(currency_rates.base_currency, base));
  return row;
}

export async function currency_rates_put(
  base: string,
  rates: Record<string, number>
) {
  await db
    .insert(currency_rates)
    .values({
      base_currency: base,
      rates,
      updated_at: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: currency_rates.base_currency,
      set: { rates, updated_at: new Date().toISOString() },
    });
}
