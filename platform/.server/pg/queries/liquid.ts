import { and, desc, gte, inArray, lte, sql } from "drizzle-orm";
import type {
  IBalLog,
  IBalLogsOptions,
  IInterestLogDb,
  IPageOptions,
} from "@/liquid";
import { db } from "../db";
import { bal_log_entries, bal_logs, intr_logs } from "../schema/liquid";
import type { DbOrTx, IPage } from "./helpers";
import { decode_date_cursor, encode_date_cursor } from "./helpers";

// -- bal_log --

export async function bal_log_put(
  db: DbOrTx,
  data: { date: string; balances: Record<string, number> }
) {
  const entries = Object.entries(data.balances);
  // parent without children would violate deferred trigger; no-op instead
  if (!entries.length) return;
  await db.transaction(async (tx) => {
    await tx.insert(bal_logs).values({ date: data.date });
    await tx.insert(bal_log_entries).values(
      entries.map(([npo_id, balance]) => ({
        date: data.date,
        npo_id: Number(npo_id),
        balance,
      }))
    );
  });
}

async function attach_balances(rows: { date: string }[]): Promise<IBalLog[]> {
  if (!rows.length) return [];
  const dates = rows.map((r) => r.date);
  const entries = await db
    .select()
    .from(bal_log_entries)
    .where(inArray(bal_log_entries.date, dates));

  const by_date = new Map<string, Record<string, number>>();
  const total_by_date = new Map<string, number>();
  for (const e of entries) {
    const m = by_date.get(e.date) ?? {};
    m[e.npo_id] = e.balance;
    by_date.set(e.date, m);
    total_by_date.set(e.date, (total_by_date.get(e.date) ?? 0) + e.balance);
  }
  return rows.map((r) => ({
    date: r.date,
    balances: by_date.get(r.date) ?? {},
    total: total_by_date.get(r.date) ?? 0,
  }));
}

export async function bal_log_list(
  opts?: IBalLogsOptions
): Promise<IPage<IBalLog>> {
  const { limit = 10, next, date_start, date_end } = opts || {};
  const cursor = decode_date_cursor(next);

  const rows = await db
    .select({ date: bal_logs.date })
    .from(bal_logs)
    .where(
      and(
        date_start
          ? gte(bal_logs.date, new Date(date_start).toISOString())
          : undefined,
        date_end
          ? lte(bal_logs.date, new Date(date_end).toISOString())
          : undefined,
        cursor ? sql`${bal_logs.date} < ${cursor}` : undefined
      )
    )
    .orderBy(desc(bal_logs.date))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = await attach_balances(rows.slice(0, limit));
  return {
    items,
    next: has_more
      ? encode_date_cursor(rows[limit - 1]?.date ?? undefined)
      : undefined,
  };
}

/** exhaustive fetch for interest share calculation */
export async function bal_logs_all(
  start: string,
  end: string
): Promise<IBalLog[]> {
  const rows = await db
    .select({ date: bal_logs.date })
    .from(bal_logs)
    .where(
      and(
        gte(bal_logs.date, new Date(start).toISOString()),
        lte(bal_logs.date, new Date(end).toISOString())
      )
    )
    .orderBy(desc(bal_logs.date));
  return attach_balances(rows);
}

// -- intr_log --

export async function intr_log_put(
  db: DbOrTx,
  data: typeof intr_logs.$inferInsert
) {
  await db.insert(intr_logs).values(data);
}

export async function intr_log_list(
  opts?: IPageOptions
): Promise<IPage<IInterestLogDb>> {
  const { limit = 10, next } = opts || {};
  const cursor = decode_date_cursor(next);

  const rows = await db
    .select({
      id: intr_logs.id,
      date_created: intr_logs.date_created,
      total: intr_logs.total,
      date_start: intr_logs.date_start,
      date_end: intr_logs.date_end,
      alloc: intr_logs.alloc,
    })
    .from(intr_logs)
    .where(cursor ? sql`${intr_logs.date_created} < ${cursor}` : undefined)
    .orderBy(desc(intr_logs.date_created))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  // drizzle: date_created not in domain
  const items = rows.slice(0, limit) as unknown as IInterestLogDb[];
  return {
    items,
    next: has_more
      ? encode_date_cursor(rows[limit - 1]?.date_created ?? undefined)
      : undefined,
  };
}
