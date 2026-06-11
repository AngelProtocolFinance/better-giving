import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { INposPage, INpoWithRegNum } from "@/npo/interfaces";
import type { INposSearchObj } from "@/npo/schema";
import type { IBalanceDeltas } from "@/types/donation";
import { db } from "../db";
import { npos } from "../schema/npo";
import { v_contributions } from "../schema/views";
import { to_target } from "./fmt";
import type { DbOrTx } from "./helpers";

type NpoRow = typeof npos.$inferSelect;
type NpoInsert = typeof npos.$inferInsert;

const npo_cols = getTableColumns(npos);

// npo row with target XOR columns converted + contributions from v_contributions JOIN
export type INpo = Omit<NpoRow, "target_number" | "target_smart"> & {
  target: "smart" | string | undefined;
  contributions_total: number;
  contributions_count: number;
};

type JoinedRow = NpoRow & {
  contributions_total: number;
  contributions_count: number;
};

function joined_select(conn: DbOrTx = db) {
  return conn
    .select({
      ...npo_cols,
      contributions_total: sql<number>`COALESCE(${v_contributions.total}, 0)`,
      contributions_count: sql<number>`COALESCE(${v_contributions.count}, 0)`,
    })
    .from(npos)
    .leftJoin(v_contributions, eq(v_contributions.npo_id, npos.id));
}

function row_to_npo(row: JoinedRow): INpo {
  const { target_number, target_smart, ...rest } = row;
  return { ...rest, target: to_target(target_number, target_smart) };
}

export async function npo_get(
  id: number,
  conn?: DbOrTx
): Promise<INpo | undefined> {
  const [row] = await joined_select(conn).where(eq(npos.id, id));
  if (!row) return undefined;
  return row_to_npo(row);
}

export async function npo_by_slug(slug: string): Promise<INpo | undefined> {
  const [row] = await joined_select().where(
    eq(sql`LOWER(${npos.slug})`, slug.toLowerCase())
  );
  if (!row) return undefined;
  return row_to_npo(row);
}

export async function npos_batch_get(ids: number[]): Promise<INpo[]> {
  if (ids.length === 0) return [];
  const rows = await joined_select().where(inArray(npos.id, ids));
  return rows.map(row_to_npo);
}

export async function npo_by_regnum(
  rn: string,
  country = "United States"
): Promise<INpoWithRegNum | undefined> {
  const [row] = await db
    .select({
      id: npos.id,
      name: npos.name,
      claimed: npos.claimed,
      hq_country: npos.hq_country,
      registration_number: npos.registration_number,
    })
    .from(npos)
    .where(and(eq(npos.registration_number, rn), eq(npos.hq_country, country)));
  return row;
}

export async function npos_referred_by(id: string): Promise<INpo[]> {
  const rows = await joined_select().where(
    or(eq(npos.referrer_user, id), eq(npos.referrer_npo, id))
  );
  return rows.map(row_to_npo);
}

export async function npo_by_rid(id: string): Promise<INpo | undefined> {
  const [row] = await joined_select().where(eq(npos.referral_id, id)).limit(1);
  if (!row) return undefined;
  return row_to_npo(row);
}

export async function npo_put(db: DbOrTx, data: NpoInsert) {
  await db.insert(npos).values(data);
}

// no lookup sync needed — UNIQUE constraints handle slug/keyword/regnum
export async function npo_update(
  db: DbOrTx,
  id: number,
  update: Partial<Omit<NpoInsert, "id">>
): Promise<void> {
  await db.update(npos).set(update).where(eq(npos.id, id));
}

// balance-only adjustment — values are signed
export async function npo_balance_adj(
  db: DbOrTx,
  id: number,
  adj: Partial<Record<"liq" | "lock_units" | "cash", number>>
) {
  await db
    .update(npos)
    .set({
      ...(adj.liq != null && {
        liq: sql`${npos.liq} + ${adj.liq}`,
      }),
      ...(adj.lock_units != null && {
        lock_units: sql`${npos.lock_units} + ${adj.lock_units}`,
      }),
      ...(adj.cash != null && {
        cash: sql`${npos.cash} + ${adj.cash}`,
      }),
    })
    .where(eq(npos.id, id));
}

export async function npo_balance_update(
  db: DbOrTx,
  id: number,
  d: IBalanceDeltas,
  dir: "inc" | "dec"
) {
  const s = dir === "inc" ? 1 : -1;
  await db
    .update(npos)
    .set({
      ...(d.liq && { liq: sql`${npos.liq} + ${s * d.liq}` }),
      ...(d.lock_units && {
        lock_units: sql`${npos.lock_units} + ${s * d.lock_units}`,
      }),
      ...(d.cash && { cash: sql`${npos.cash} + ${s * d.cash}` }),
      // contributions_total/count eliminated — derived via v_contributions view
    })
    .where(eq(npos.id, id));
}

export async function npo_balances_get(
  ids: number[]
): Promise<{ id: number; liq: number }[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: npos.id, liq: npos.liq })
    .from(npos)
    .where(inArray(npos.id, ids));
  return rows.map((r) => ({ id: r.id, liq: r.liq ?? 0 }));
}

export async function npo_all_liq(): Promise<{ id: number; liq: number }[]> {
  const rows = await db.select({ id: npos.id, liq: npos.liq }).from(npos);
  return rows.map((r) => ({ id: r.id, liq: r.liq ?? 0 }));
}

const HITS_PER_PAGE = 20;

// pg_trgm fuzzy search — replaces fetch-all + Fuse.js
export async function npo_search(
  params: Omit<INposSearchObj, "fields">
): Promise<INposPage> {
  const { query: q, page = 1, ...p } = params;

  const conditions: SQL[] = [eq(npos.active, true)];

  if (p.published?.length)
    conditions.push(inArray(npos.published, p.published));
  if (p.claimed?.length) conditions.push(inArray(npos.claimed, p.claimed));
  if (p.endow_designation?.length)
    conditions.push(inArray(npos.endow_designation, p.endow_designation));
  if (p.kyc_only?.length)
    conditions.push(inArray(npos.kyc_donors_only, p.kyc_only));
  if (p.fund_opt_in?.length)
    conditions.push(inArray(npos.fund_opt_in, p.fund_opt_in));
  if (p.sdgs?.length)
    conditions.push(
      sql`${npos.sdgs} && ARRAY[${sql.join(
        p.sdgs.map((s) => sql`${s}`),
        sql`, `
      )}]::int[]`
    );
  if (p.countries?.length) {
    conditions.push(
      or(
        inArray(npos.hq_country, p.countries),
        sql`${npos.active_in_countries} && ARRAY[${sql.join(
          p.countries.map((c) => sql`${c}`),
          sql`, `
        )}]::text[]`
      )!
    );
  }

  // pg_trgm similarity filter
  if (q) {
    conditions.push(
      or(
        sql`similarity(${npos.name}, ${q}) > 0.1`,
        sql`similarity(${npos.tagline}, ${q}) > 0.1`,
        sql`${npos.registration_number} ILIKE ${`%${q}%`}`
      )!
    );
  }

  const rank = q
    ? sql<number>`GREATEST(
        similarity(${npos.name}, ${q}) * 3,
        similarity(COALESCE(${npos.tagline}, ''), ${q}) * 2,
        similarity(${npos.registration_number}, ${q})
      )`
    : null;

  const rows = await db
    .select({
      id: npos.id,
      name: npos.name,
      card_img: npos.card_img,
      tagline: npos.tagline,
      hq_country: npos.hq_country,
      sdgs: npos.sdgs,
      active_in_countries: npos.active_in_countries,
      endow_designation: npos.endow_designation,
      registration_number: npos.registration_number,
      kyc_donors_only: npos.kyc_donors_only,
      claimed: npos.claimed,
      published: npos.published,
      active: npos.active,
      fund_opt_in: npos.fund_opt_in,
      target_number: npos.target_number,
      target_smart: npos.target_smart,
      contributions_total: sql<number>`COALESCE(${v_contributions.total}, 0)`,
      contributions_count: sql<number>`COALESCE(${v_contributions.count}, 0)`,
      total: sql<number>`COUNT(*) OVER()`,
    })
    .from(npos)
    .leftJoin(v_contributions, eq(v_contributions.npo_id, npos.id))
    .where(and(...conditions))
    .orderBy(rank ? desc(rank) : asc(npos.name))
    .limit(HITS_PER_PAGE)
    .offset((page - 1) * HITS_PER_PAGE);

  const total = rows[0]?.total ?? 0;

  return {
    items: rows.map((r) => {
      const { target_number, target_smart, total: _, ...rest } = r;
      return { ...rest, target: to_target(target_number, target_smart) };
    }),
    page,
    pages: Math.max(1, Math.ceil(total / HITS_PER_PAGE)),
  };
}
