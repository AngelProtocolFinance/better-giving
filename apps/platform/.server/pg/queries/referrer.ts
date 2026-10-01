import { and, asc, desc, eq, inArray, or, sql, sum } from "drizzle-orm";
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

// --- wise payout claim ---

type CommissionRow = typeof referrer_commissions.$inferSelect;

function to_commission(r: CommissionRow): ICommission {
  return {
    date: r.date,
    referrer_user: r.referrer_user ?? undefined,
    referrer_npo: r.referrer_npo ?? undefined,
    donation_id: r.donation_id,
    npo_id: r.npo_id,
    amount: r.amount,
    status: r.status,
    ref: r.ref ?? undefined,
  };
}

const of_referrer = (referrer: string) =>
  or(
    eq(referrer_commissions.referrer_user, referrer),
    eq(referrer_commissions.referrer_npo, referrer)
  );

/**
 * claims every pending commission of `referrer` for one transfer: moves them
 * to processing with `mk_ref(pending)` stored as their ref. undefined when
 * none is pending — a concurrent claim waits on the row locks, then finds
 * them processing and takes nothing.
 */
export async function commissions_claim(
  db: DbOrTx,
  referrer: string,
  mk_ref: (pending: ICommission[]) => string
): Promise<{ ref: string; commissions: ICommission[] } | undefined> {
  return db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(referrer_commissions)
      .where(
        and(of_referrer(referrer), eq(referrer_commissions.status, "pending"))
      )
      .orderBy(asc(referrer_commissions.donation_id))
      .for("update");
    if (locked.length === 0) return undefined;
    const pending = locked.map(to_commission);
    const ref = mk_ref(pending);
    await tx
      .update(referrer_commissions)
      .set({ status: "processing", ref })
      .where(
        and(
          inArray(
            referrer_commissions.donation_id,
            pending.map((c) => c.donation_id)
          ),
          eq(referrer_commissions.status, "pending")
        )
      );
    return {
      ref,
      commissions: pending.map((c) => ({ ...c, status: "processing", ref })),
    };
  });
}

/** compare-and-set of the ref's commissions still processing; returns those it moved */
async function claimed_move(
  db: DbOrTx,
  ref: string,
  upd: { status: "pending"; ref: null } | { status: "paid" }
): Promise<ICommission[]> {
  const rows = await db
    .update(referrer_commissions)
    .set(upd)
    .where(
      and(
        eq(referrer_commissions.ref, ref),
        eq(referrer_commissions.status, "processing")
      )
    )
    .returning();
  return rows
    .map(to_commission)
    .sort((a, b) => a.donation_id.localeCompare(b.donation_id));
}

/** the transfer was never funded: the ref's claimed commissions go back to pending */
export function commissions_release(db: DbOrTx, ref: string) {
  return claimed_move(db, ref, { status: "pending", ref: null });
}

/** the transfer was funded: the ref's claimed commissions are paid, ref kept */
export function commissions_mark_paid(db: DbOrTx, ref: string) {
  return claimed_move(db, ref, { status: "paid" });
}

export async function referrer_payout_put(db: DbOrTx, data: IPayout) {
  // drizzle: error/transfer_id nullable, domain has optional; id nullable, domain requires string
  await db.insert(referrer_payouts).values(data as any);
}
