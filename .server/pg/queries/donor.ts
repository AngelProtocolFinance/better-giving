import { and, eq, type SQL, sql } from "drizzle-orm";
import * as v from "valibot";
import { db } from "../db";
import { dists } from "../schema/dist";
import { donation_donors } from "../schema/donation";
import { subscriptions } from "../schema/subscription";
import { decode_cursor, encode_cursor, type IPage } from "./helpers";

// -- tab badge counts (cheap) --

export async function npo_donor_tab_counts(
  npo_id: number
): Promise<{ donor_total: number; sub_count: number }> {
  const [[donor], [sub]] = await Promise.all([
    db
      .select({
        n: sql<number>`count(distinct ${donation_donors.email})::int`,
      })
      .from(dists)
      .innerJoin(
        donation_donors,
        eq(donation_donors.donation_id, dists.donation_id)
      )
      .where(and(eq(dists.to_id, npo_id), eq(dists.status, "settled"))),
    db
      .select({
        n: sql<number>`count(distinct ${subscriptions.from_id})::int`,
      })
      .from(subscriptions)
      .where(eq(subscriptions.to_npo_id, npo_id)),
  ]);
  return { donor_total: donor?.n ?? 0, sub_count: sub?.n ?? 0 };
}

// -- all-donors list --

export type TDonorSort = "name" | "count" | "total";
export type TDir = "asc" | "desc";

export interface INpoDonor {
  email: string;
  name: string | null;
  count: number;
  total: number;
}

interface INpoDonorListOpts {
  limit?: number;
  next?: string;
  sort?: TDonorSort;
  dir?: TDir;
}

const cursor_schema = v.object({
  v: v.union([v.string(), v.number()]),
  email: v.string(),
});

// identifier-only sql chunks; never built from user-provided strings.
const SORT_COL: Record<TDonorSort, SQL> = {
  name: sql`name`,
  count: sql`count`,
  total: sql`total`,
};

export async function npo_donor_list(
  npo_id: number,
  opts: INpoDonorListOpts = {}
): Promise<IPage<INpoDonor>> {
  const { limit = 20, next, sort = "total", dir = "desc" } = opts;
  const col = SORT_COL[sort];
  const order = dir === "desc" ? sql`desc` : sql`asc`;

  let cursor: v.InferOutput<typeof cursor_schema> | undefined;
  if (next) {
    const decoded = decode_cursor(next);
    const parsed = v.safeParse(cursor_schema, decoded);
    if (!parsed.success) throw new Error("malformed cursor");
    cursor = parsed.output;
  }

  // row-comparison cursor with email tiebreaker (mandatory for stable pagination on ties)
  const cursor_sql = cursor
    ? dir === "desc"
      ? sql`(${col}, email) < (${cursor.v}, ${cursor.email})`
      : sql`(${col}, email) > (${cursor.v}, ${cursor.email})`
    : sql`true`;

  const rows = (
    await db.execute(sql`
    with per_donor as (
      select
        dd.email,
        max(dd.name) as name,
        count(*)::int as count,
        sum(d.amount_usd)::numeric(20,2)::float8 as total
      from ${dists} d
      join ${donation_donors} dd on dd.donation_id = d.donation_id
      where d.to_id = ${npo_id} and d.status = 'settled'
      group by dd.email
    )
    select email, name, count, total
    from per_donor
    where ${cursor_sql}
    order by ${col} ${order}, email asc
    limit ${limit + 1}
  `)
  ).rows as unknown as INpoDonor[];

  const items = rows.slice(0, limit);
  const has_more = rows.length > limit;
  const last = items[items.length - 1];

  return {
    items,
    next:
      has_more && last
        ? encode_cursor({
            v: sort === "name" ? (last.name ?? "") : last[sort],
            email: last.email,
          })
        : undefined,
  };
}

// -- summary (KPI cards) --

export interface INpoDonorSummary {
  total_donors: number;
  new_this_month_count: number;
  new_prev_month_count: number;
  /** 12 trailing months (oldest..current), cumulative distinct-donor count */
  trend_total: number[];
  /** 12 trailing months (oldest..current), new-donor count per month */
  trend_new: number[];
}

interface ISummaryRow {
  bucket: string;
  new_count: number;
  cumulative: number;
  total_donors: number;
  new_this_month: number;
  new_prev_month: number;
}

export async function npo_donor_summary(
  npo_id: number
): Promise<INpoDonorSummary> {
  // single round-trip via shared CTE
  const rows = (
    await db.execute(sql`
    with first_donation as (
      select dd.email, min(d.date_created)::date as first_at
      from ${dists} d
      join ${donation_donors} dd on dd.donation_id = d.donation_id
      where d.to_id = ${npo_id} and d.status = 'settled'
      group by dd.email
    ),
    monthly as (
      select date_trunc('month', first_at)::date as m, count(*)::int as added
      from first_donation
      group by 1
    ),
    months as (
      select generate_series(
        date_trunc('month', now()) - interval '11 months',
        date_trunc('month', now()),
        interval '1 month'
      )::date as m
    ),
    series as (
      select
        months.m as bucket,
        coalesce(monthly.added, 0) as new_count,
        coalesce(
          (select sum(mm.added) from monthly mm where mm.m <= months.m),
          0
        )::int as cumulative
      from months
      left join monthly on monthly.m = months.m
    ),
    totals as (
      select
        count(*)::int as total_donors,
        count(*) filter (where first_at >= date_trunc('month', now()))::int as new_this_month,
        count(*) filter (
          where first_at >= date_trunc('month', now()) - interval '1 month'
            and first_at < date_trunc('month', now())
        )::int as new_prev_month
      from first_donation
    )
    select
      to_char(series.bucket, 'YYYY-MM') as bucket,
      series.new_count,
      series.cumulative,
      totals.total_donors,
      totals.new_this_month,
      totals.new_prev_month
    from series, totals
    order by series.bucket asc
  `)
  ).rows as unknown as ISummaryRow[];

  const arr = rows;

  return {
    total_donors: arr[0]?.total_donors ?? 0,
    new_this_month_count: arr[0]?.new_this_month ?? 0,
    new_prev_month_count: arr[0]?.new_prev_month ?? 0,
    trend_total: arr.map((r) => r.cumulative),
    trend_new: arr.map((r) => r.new_count),
  };
}
