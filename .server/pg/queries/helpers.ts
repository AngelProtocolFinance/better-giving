import type { Db } from "../db";

// tx-or-db: functions accept either a transaction handle or a db instance
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

// keyset pagination
export interface IPage<T> {
  items: T[];
  next?: string;
}

export function encode_cursor(
  key: Record<string, unknown> | undefined
): string | undefined {
  if (!key) return undefined;
  return Buffer.from(JSON.stringify(key)).toString("base64url");
}

export function decode_cursor(c?: string): Record<string, unknown> | undefined {
  if (!c) return undefined;
  return JSON.parse(Buffer.from(c, "base64url").toString());
}

export function encode_date_cursor(
  date: Date | string | null | undefined
): string | undefined {
  if (!date) return undefined;
  const iso = date instanceof Date ? date.toISOString() : date;
  return btoa(iso).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decode_date_cursor(c?: string): string | undefined {
  if (!c) return undefined;
  return atob(c.replace(/-/g, "+").replace(/_/g, "/"));
}
