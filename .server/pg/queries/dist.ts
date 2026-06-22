import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import type { IBalanceTx } from "@/balance-txs";
import type { IDonationsSearch, IPageOpts } from "@/donation";
import type { IAddr } from "@/types/donation";
import { db } from "../db";
import { bal_txs } from "../schema/bal-tx";
import { dists } from "../schema/dist";
import {
  donation_donors,
  donation_settlements,
  donations,
} from "../schema/donation";
import { forms } from "../schema/form";
import { npos } from "../schema/npo";
import { payouts } from "../schema/payout";
import { referrer_commissions } from "../schema/referrer";
import { rev_logs } from "../schema/revenue";
import type { DbOrTx, IPage } from "./helpers";
import { decode_date_cursor, encode_date_cursor } from "./helpers";

export type DistRow = typeof dists.$inferSelect;
type DistInsert = typeof dists.$inferInsert;

/** dist joined with parent donation + donor + settlement */
export interface INpoDonation extends DistRow {
  // from donations
  frequency: string;
  via: string;
  source: string;
  form_id: string | null;
  form_name: string | null;
  form_tag: string | null;
  program_id: string | null;
  program_name: string | null;
  // from donation_donors
  from_email: string;
  from_name: string | null;
  from_company: string | null;
  from_addr: IAddr | null;
  // from donation_settlements
  sttl_id: string | null;
  sttl_date: string | null;
  sttl_currency: string | null;
}

// select shape for joined query
const dist_joined = {
  dist: dists,
  don: {
    frequency: donations.frequency,
    via: donations.via,
    source: donations.source,
    form_id: donations.form_id,
    program_id: donations.program_id,
    program_name: donations.program_name,
  },
  donor: {
    email: donation_donors.email,
    name: donation_donors.name,
    company_name: donation_donors.company_name,
    addr: donation_donors.addr,
  },
  sttl: {
    sttl_id: donation_settlements.sttl_id,
    date: donation_settlements.date,
    currency: donation_settlements.currency,
  },
  form: {
    name: forms.name,
    tag: forms.tag,
  },
};

type JoinedRow = {
  dist: DistRow;
  don: {
    frequency: string;
    via: string;
    source: string;
    form_id: string | null;
    program_id: string | null;
    program_name: string | null;
  };
  donor: {
    email: string;
    name: string | null;
    company_name: string | null;
    addr: IAddr | null;
  } | null;
  sttl: {
    sttl_id: string;
    date: string;
    currency: string;
  } | null;
  form: {
    name: string;
    tag: string | null;
  } | null;
};

function to_npo_donation(r: JoinedRow): INpoDonation {
  return {
    ...r.dist,
    frequency: r.don.frequency,
    via: r.don.via,
    source: r.don.source,
    form_id: r.don.form_id,
    form_name: r.form?.name ?? null,
    form_tag: r.form?.tag ?? null,
    program_id: r.don.program_id,
    program_name: r.don.program_name,
    from_email: r.donor?.email ?? "",
    from_name: r.donor?.name ?? null,
    from_company: r.donor?.company_name ?? null,
    from_addr: r.donor?.addr ?? null,
    sttl_id: r.sttl?.sttl_id ?? null,
    sttl_date: r.sttl?.date ?? null,
    sttl_currency: r.sttl?.currency ?? null,
  };
}

// base query builder — all dist reads join the same tables
function dist_base() {
  return db
    .select(dist_joined)
    .from(dists)
    .innerJoin(donations, eq(dists.donation_id, donations.id))
    .leftJoin(
      donation_donors,
      eq(dists.donation_id, donation_donors.donation_id)
    )
    .leftJoin(
      donation_settlements,
      eq(dists.donation_id, donation_settlements.donation_id)
    )
    .leftJoin(forms, eq(donations.form_id, forms.id));
}

export async function npo_donation_get(
  id: string
): Promise<INpoDonation | undefined> {
  const [row] = await dist_base().where(eq(dists.id, id));
  return row ? to_npo_donation(row as JoinedRow) : undefined;
}

export async function dist_put(db: DbOrTx, data: DistInsert) {
  await db.insert(dists).values(data);
}

export async function dist_update(
  db: DbOrTx,
  id: string,
  data: Partial<Omit<DistInsert, "id">>
) {
  await db.update(dists).set(data).where(eq(dists.id, id));
}

/** paginated donations received by npo */
export async function npo_donations(
  npo_id: number,
  opts?: IDonationsSearch
): Promise<IPage<INpoDonation>> {
  const { limit = 10, next, date_start, date_end } = opts || {};
  const cursor = decode_date_cursor(next);

  const rows = await dist_base()
    .where(
      and(
        eq(dists.to_id, npo_id),
        date_start
          ? gte(dists.date_created, new Date(date_start).toISOString())
          : undefined,
        date_end
          ? lte(dists.date_created, new Date(date_end).toISOString())
          : undefined,
        cursor ? sql`${dists.date_created} < ${cursor}` : undefined
      )
    )
    .orderBy(desc(dists.date_created))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = rows
    .slice(0, limit)
    .map((r) => to_npo_donation(r as JoinedRow));
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date_created)
      : undefined,
  };
}

/** paginated donations by donor email */
export async function user_donations(
  email: string,
  opts?: IDonationsSearch
): Promise<IPage<INpoDonation>> {
  const { limit = 10, next, date_start, date_end } = opts || {};
  const cursor = decode_date_cursor(next);

  const rows = await dist_base()
    .where(
      and(
        eq(donation_donors.email, email),
        date_start
          ? gte(dists.date_created, new Date(date_start).toISOString())
          : undefined,
        date_end
          ? lte(dists.date_created, new Date(date_end).toISOString())
          : undefined,
        cursor ? sql`${dists.date_created} < ${cursor}` : undefined
      )
    )
    .orderBy(desc(dists.date_created))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = rows
    .slice(0, limit)
    .map((r) => to_npo_donation(r as JoinedRow));
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date_created)
      : undefined,
  };
}

// -- refund support --

export interface DistRefundGraph {
  dist: DistRow;
  bal_txs: IBalanceTx[];
  rev_logs: (typeof rev_logs.$inferSelect)[];
  payout: typeof payouts.$inferSelect | undefined;
  commission: typeof referrer_commissions.$inferSelect | undefined;
}

/** fetch all dists for a donation with their downstream records for refund processing */
export async function dists_for_refund(
  donation_id: string
): Promise<DistRefundGraph[]> {
  const dist_rows = await db
    .select()
    .from(dists)
    .where(
      and(eq(dists.donation_id, donation_id), eq(dists.status, "settled"))
    );

  const results: DistRefundGraph[] = [];
  for (const dist of dist_rows) {
    const [bts, rls, [po], [comm]] = await Promise.all([
      db.select().from(bal_txs).where(eq(bal_txs.account_other_id, dist.id)),
      db.select().from(rev_logs).where(eq(rev_logs.donation_id, dist.id)),
      db
        .select()
        .from(payouts)
        .where(
          and(eq(payouts.source_id, dist.id), eq(payouts.source, "donation"))
        ),
      db
        .select()
        .from(referrer_commissions)
        .where(eq(referrer_commissions.donation_id, dist.id)),
    ]);
    results.push({
      dist,
      bal_txs: bts as IBalanceTx[],
      rev_logs: rls,
      payout: po,
      commission: comm,
    });
  }
  return results;
}

/** true when any sibling dist for this donation already settled with a loss */
export async function donation_has_refund_loss(
  donation_id: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: dists.id })
    .from(dists)
    .where(
      and(eq(dists.donation_id, donation_id), eq(dists.refund_status, "loss"))
    )
    .limit(1);
  return !!row;
}

export async function dist_refund_update(
  db: DbOrTx,
  id: string,
  data: {
    refund_status: "completed" | "failed" | "loss";
    refund_error?: string;
  }
) {
  // failed dists keep status="settled" so they remain eligible for retry
  // (dists_for_refund filters status="settled"). completed/loss flip to
  // refunded (preserves prior behavior).
  const status = data.refund_status === "failed" ? undefined : "refunded";
  await db
    .update(dists)
    .set({ ...(status && { status }), ...data })
    .where(eq(dists.id, id));
}

/** paginated donations by npo referrer */
export async function referrer_donations(
  referrer: string,
  opts?: IPageOpts
): Promise<IPage<INpoDonation>> {
  const { limit = 10, next } = opts || {};
  const cursor = decode_date_cursor(next);

  const rows = await dist_base()
    .innerJoin(npos, eq(dists.to_id, npos.id))
    .where(
      and(
        or(eq(npos.referrer_user, referrer), eq(npos.referrer_npo, referrer)),
        cursor ? sql`${dists.date_created} < ${cursor}` : undefined
      )
    )
    .orderBy(desc(dists.date_created))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = rows
    .slice(0, limit)
    .map((r) => to_npo_donation(r as JoinedRow));
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date_created)
      : undefined,
  };
}
