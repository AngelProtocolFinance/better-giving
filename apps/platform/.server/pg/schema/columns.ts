import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

// numeric columns return string from driver; domain interfaces expect number.
// .$type<number>() is type-only — still returns strings at runtime.
// customType() provides both type + runtime conversion.
export const numeric_as_number = customType<{
  data: number;
  driverData: string;
  config: { precision: number; scale: number };
  configRequired: true;
}>({
  dataType(config) {
    return `numeric(${config.precision}, ${config.scale})`;
  },
  fromDriver(value: string): number {
    return Number(value);
  },
  toDriver(value: number): string {
    return String(value);
  },
});

// timestamp columns return Date from driver; domain interfaces expect ISO string.
export const timestamp_as_iso = customType<{
  data: string;
  driverData: string;
  config: { withTimezone?: boolean };
}>({
  dataType(config) {
    return config?.withTimezone ? "timestamptz" : "timestamp";
  },
  fromDriver(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  },
  toDriver(value: string | Date): string {
    return value instanceof Date ? value.toISOString() : value;
  },
});

// timestamptz with default now(), common pattern
export const timestamptz = (name: string) =>
  timestamp_as_iso(name, { withTimezone: true });

export const timestamptz_now = (name: string) =>
  timestamptz(name).notNull().default(sql`now()`);
