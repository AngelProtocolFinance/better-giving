import { desc, eq, sql } from "drizzle-orm";
import type {
  ILossLog,
  ILossLtd,
  ILossPageOptions,
  IRevenueLog,
  IRevenueLtd,
  IRevenuePageOptions,
} from "@/revenue/interfaces";
import { db } from "../db";
import { loss_logs, rev_logs } from "../schema/revenue";
import { v_loss_ltd, v_rev_ltd } from "../schema/views";
import type { DbOrTx, IPage } from "./helpers";
import { decode_date_cursor, encode_date_cursor } from "./helpers";

// --- rev_log ---

export async function rev_log_list(
  opts?: IRevenuePageOptions
): Promise<IPage<IRevenueLog>> {
  const { limit = 20, next } = opts || {};
  const cursor = decode_date_cursor(next);

  const rows = await db
    .select()
    .from(rev_logs)
    .where(cursor ? sql`${rev_logs.date} < ${cursor}` : undefined)
    .orderBy(desc(rev_logs.date))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = rows.slice(0, limit);
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date)
      : undefined,
  };
}

/** idempotent — skips if id already exists */
export async function rev_log_put(db: DbOrTx, data: IRevenueLog) {
  await db.insert(rev_logs).values(data).onConflictDoNothing();
}

export async function rev_log_update_status(
  db: DbOrTx,
  id: string,
  status: "refunded" | "refunded_loss"
) {
  await db.update(rev_logs).set({ status }).where(eq(rev_logs.id, id));
}

// --- rev_ltd (view) ---

/** all npo/type revenue totals — replaces rev_ltd singleton */
export async function rev_ltd_get(): Promise<IRevenueLtd | undefined> {
  const rows = await db.select().from(v_rev_ltd);
  if (rows.length === 0) return undefined;
  // db stores hyphens ("base-fee"), domain uses underscores ("base_fee")
  const to_key: Record<string, string> = {
    tip: "tip",
    "base-fee": "base_fee",
    "fsa-fee": "fsa_fee",
  };
  const result: Record<string, number> = { tip: 0, base_fee: 0, fsa_fee: 0 };
  for (const r of rows) {
    const v = r.total ?? 0;
    const type = r.type ?? "";
    const key = to_key[type];
    if (key) result[key] += v;
    if (r.npo_id != null) {
      const npo_key = `#${r.npo_id}.${key ?? type}`;
      result[npo_key] = (result[npo_key] ?? 0) + v;
    }
  }
  return result as unknown as IRevenueLtd;
}

/** revenue totals for a specific npo */
export async function rev_ltd_by_npo(
  npo_id: number
): Promise<(typeof v_rev_ltd.$inferSelect)[]> {
  return db.select().from(v_rev_ltd).where(eq(v_rev_ltd.npo_id, npo_id));
}

// --- loss_log ---

export async function loss_log_list(
  opts?: ILossPageOptions
): Promise<IPage<ILossLog>> {
  const { limit = 20, next } = opts || {};
  const cursor = decode_date_cursor(next);

  const rows = await db
    .select()
    .from(loss_logs)
    .where(cursor ? sql`${loss_logs.date} < ${cursor}` : undefined)
    .orderBy(desc(loss_logs.date))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = rows.slice(0, limit);
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date)
      : undefined,
  };
}

/** idempotent — skips if id already exists */
export async function loss_log_put(db: DbOrTx, data: ILossLog) {
  await db.insert(loss_logs).values(data).onConflictDoNothing();
}

// --- loss_ltd (view) ---

/** all npo loss totals — replaces loss_ltd singleton */
export async function loss_ltd_get(): Promise<ILossLtd | undefined> {
  const rows = await db.select().from(v_loss_ltd);
  if (rows.length === 0) return undefined;
  const result: ILossLtd = { total: 0 };
  for (const r of rows) {
    const v = r.total ?? 0;
    result.total += v;
    if (r.npo_id != null) {
      const key = `#${r.npo_id}` as keyof ILossLtd;
      result[key] = ((result[key] as number) ?? 0) + v;
    }
  }
  return result;
}

/** loss total for a specific npo */
export async function loss_ltd_by_npo(
  npo_id: number
): Promise<(typeof v_loss_ltd.$inferSelect)[]> {
  return db.select().from(v_loss_ltd).where(eq(v_loss_ltd.npo_id, npo_id));
}
