import { and, desc, eq, or, sql, sum } from "drizzle-orm";
import type { ICommission, IPayout, TStatus } from "@/referrals";
import { db } from "../db";
import { referrer_commissions, referrer_payouts } from "../schema/referrer";
import {
  v_referrer_commissions_ltd,
  v_referrer_payout_ltd,
} from "../schema/views";
import type { DbOrTx, IPage } from "./helpers";
import { decode_date_cursor, encode_date_cursor } from "./helpers";

// --- commission queries ---

/** all commissions with a given status (no pagination — drains full set) */
export async function commissions_all_by_status(
  status: TStatus
): Promise<ICommission[]> {
  const rows = await db
    .select()
    .from(referrer_commissions)
    .where(eq(referrer_commissions.status, status));
  // drizzle: status is plain text, domain requires TStatus union
  return rows as unknown as ICommission[];
}

export async function pending_earnings(referrer: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(referrer_commissions.amount) })
    .from(referrer_commissions)
    .where(
      and(
        or(
          eq(referrer_commissions.referrer_user, referrer),
          eq(referrer_commissions.referrer_npo, referrer)
        ),
        eq(referrer_commissions.status, "pending")
      )
    );
  return Number(row?.total ?? 0);
}

// --- payout queries ---

export async function referrer_payout_list(
  referrer: string,
  opts?: { next?: string; limit?: number }
): Promise<IPage<IPayout>> {
  const { limit = 10, next } = opts || {};
  const cursor = decode_date_cursor(next);

  const rows = await db
    .select()
    .from(referrer_payouts)
    .where(
      and(
        or(
          eq(referrer_payouts.referrer_user, referrer),
          eq(referrer_payouts.referrer_npo, referrer)
        ),
        cursor ? sql`${referrer_payouts.date} < ${cursor}` : undefined
      )
    )
    .orderBy(desc(referrer_payouts.date))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  // drizzle: error/transfer_id nullable, domain requires string / optional
  const items = rows.slice(0, limit) as unknown as IPayout[];
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date)
      : undefined,
  };
}

/** payout LTD — from view */
export async function payout_ltd_get(referrer: string): Promise<number> {
  const [row] = await db
    .select()
    .from(v_referrer_payout_ltd)
    .where(eq(v_referrer_payout_ltd.referrer, referrer));
  return Number(row?.total ?? 0);
}

/** commissions LTD per npo — from view */
export async function commissions_ltd_get(
  referrer: string
): Promise<(typeof v_referrer_commissions_ltd.$inferSelect)[]> {
  return db
    .select()
    .from(v_referrer_commissions_ltd)
    .where(eq(v_referrer_commissions_ltd.referrer, referrer));
}

// --- writes ---

export async function commission_put(db: DbOrTx, data: ICommission) {
  await db.insert(referrer_commissions).values(data);
}

export async function commission_update_status(
  db: DbOrTx,
  donation_id: string,
  status: TStatus
) {
  await db
    .update(referrer_commissions)
    .set({ status })
    .where(eq(referrer_commissions.donation_id, donation_id));
}

export async function referrer_payout_put(db: DbOrTx, data: IPayout) {
  // drizzle: error/transfer_id nullable, domain has optional; id nullable, domain requires string
  await db.insert(referrer_payouts).values(data as any);
}
