import { and, desc, eq, sql } from "drizzle-orm";
import type {
  INpoPayoutsOptions,
  INpoSettlementsOptions,
  IPayout,
} from "@/payouts";
import { db } from "../db";
import { payouts, settlements } from "../schema/payout";
import type { DbOrTx, IPage } from "./helpers";
import { decode_date_cursor, encode_date_cursor } from "./helpers";
import {
  from_payout_insert,
  from_payout_update,
  to_payout,
} from "./mappers/payout";

// -- payouts --

export async function payout_get(id: string): Promise<IPayout | undefined> {
  const [row] = await db.select().from(payouts).where(eq(payouts.id, id));
  return row ? to_payout(row) : undefined;
}

export async function npo_payouts(
  npo_id: number,
  opts: INpoPayoutsOptions
): Promise<IPage<IPayout>> {
  const { limit = 10, next, status } = opts;
  const cursor = decode_date_cursor(next);

  const rows = await db
    .select()
    .from(payouts)
    .where(
      and(
        eq(payouts.npo_id, npo_id),
        status ? eq(payouts.type, status) : undefined,
        cursor ? sql`${payouts.date} < ${cursor}` : undefined
      )
    )
    .orderBy(desc(payouts.date))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = rows.slice(0, limit).map(to_payout);
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date ?? undefined)
      : undefined,
  };
}

/** all pending payouts (no pagination — drains full set) */
export async function pending_payouts(): Promise<IPayout[]> {
  const rows = await db
    .select()
    .from(payouts)
    .where(eq(payouts.type, "pending"))
    .orderBy(desc(payouts.date));
  return rows.map(to_payout);
}

export async function payout_put(db: DbOrTx, data: IPayout) {
  await db.insert(payouts).values(from_payout_insert(data));
}

export async function payout_update(
  db: DbOrTx,
  id: string,
  upd: Partial<Omit<IPayout, "id">>
) {
  await db
    .update(payouts)
    .set(from_payout_update(upd))
    .where(eq(payouts.id, id));
}

// -- settlements --

export type SettlementRow = typeof settlements.$inferSelect;
type SettlementInsert = typeof settlements.$inferInsert;

export async function npo_settlements(
  npo_id: number,
  opts: INpoSettlementsOptions
): Promise<IPage<SettlementRow>> {
  const { limit = 10, next } = opts;
  const cursor = decode_date_cursor(next);

  const rows = await db
    .select()
    .from(settlements)
    .where(
      and(
        eq(settlements.npo_id, npo_id),
        cursor ? sql`${settlements.date} < ${cursor}` : undefined
      )
    )
    .orderBy(desc(settlements.date))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = rows.slice(0, limit);
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date ?? undefined)
      : undefined,
  };
}

export async function settlement_put(db: DbOrTx, data: SettlementInsert) {
  await db.insert(settlements).values(data);
}
