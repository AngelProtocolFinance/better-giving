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

// drizzle's pglite and neon sessions both override the timestamp parsers, so the
// driver hands over postgres text ("2027-09-23 12:55:37.123456+05:30"), never a
// Date. ' ' < 'T', so that text string-compares wrong against toISOString().
// the fraction bypasses Date, which would cut microseconds and break keyset
// cursors fed back as `created_at < cursor`; padded to 3 so the common case
// stays byte-identical to toISOString().
const pg_text_to_iso = (pg: string): string => {
  const iso = pg.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const fraction = iso.match(/\.(\d+)/)?.[1] ?? "";
  const whole = iso.replace(/\.\d+/, "");
  const has_offset = /(Z|[+-]\d{2}:\d{2})$/.test(whole);
  const utc = new Date(has_offset ? whole : `${whole}Z`).toISOString();
  return `${utc.slice(0, 19)}.${fraction.padEnd(3, "0")}Z`;
};

// domain interfaces expect a full ISO-8601 UTC string, as Date.toISOString() writes it.
export const timestamp_as_iso = customType<{
  data: string;
  driverData: string;
  config: { withTimezone?: boolean };
}>({
  dataType(config) {
    return config?.withTimezone ? "timestamptz" : "timestamp";
  },
  fromDriver(value: string): string {
    return pg_text_to_iso(value);
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
