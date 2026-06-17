import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { to_text } from "#/components/rich-text/helpers";
import type {
  IFund,
  IFundItem,
  IFundItemsPage,
  IFundsPageOpts,
} from "@/fundraiser/interfaces";
import type {
  IFundsNpoMemberOfSearchObj,
  IFundsSearchObj,
  IFundUpdate,
} from "@/fundraiser/schema";
import type { IPageKeyed } from "@/types/api";
import { db } from "../db";
import { user } from "../schema/auth";
import { fund_members, funds } from "../schema/fund";
import { v_donation_total_usd } from "../schema/views";
import { from_target, to_target } from "./fmt";
import { type DbOrTx, decode_date_cursor, encode_date_cursor } from "./helpers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fund_cols = getTableColumns(funds);
const fund_with_joined = {
  ...fund_cols,
  creator_name: sql<string>`${user.first_name} || ' ' || ${user.last_name}`,
  donation_total_usd: sql<number>`COALESCE(${v_donation_total_usd.total}, 0)`,
};

type FundRow = typeof funds.$inferSelect & {
  creator_name: string;
  donation_total_usd: number;
};

// consumers use this type directly — no IFund cast needed
export type IFundRow = Omit<FundRow, "target_number" | "target_smart"> & {
  target: ReturnType<typeof to_target>;
  members: number[];
};

// target_number + target_smart → single target field; hydrate members from junction
function row_to_fund(r: FundRow, members: number[]): IFundRow {
  const { target_number, target_smart, ...rest } = r;
  return { ...rest, target: to_target(target_number, target_smart), members };
}

function fund_query() {
  return db
    .select(fund_with_joined)
    .from(funds)
    .innerJoin(user, eq(user.id, funds.creator_id))
    .leftJoin(v_donation_total_usd, eq(v_donation_total_usd.fund_id, funds.id));
}

async function hydrate_members(fund_id: string): Promise<number[]> {
  const rows = await db
    .select({ npo_id: fund_members.npo_id })
    .from(fund_members)
    .where(eq(fund_members.fund_id, fund_id))
    .orderBy(fund_members.position);
  return rows.map((r) => r.npo_id);
}

export async function fund_get(id: string): Promise<IFundRow | undefined> {
  const [row] = await fund_query().where(eq(funds.id, id));
  if (!row) return;
  const members = await hydrate_members(id);
  return row_to_fund(row, members);
}

export async function fund_by_slug(
  slug: string
): Promise<IFundRow | undefined> {
  const [row] = await fund_query().where(eq(funds.slug, slug));
  if (!row) return;
  const members = await hydrate_members(row.id);
  return row_to_fund(row, members);
}

// resolve by uuid or slug
export async function fund_get_or_slug(
  id: string
): Promise<IFundRow | undefined> {
  if (UUID_RE.test(id)) return fund_get(id);
  return fund_by_slug(id);
}

export async function funds_batch_get(ids: string[]): Promise<IFundRow[]> {
  if (ids.length === 0) return [];
  const rows = await fund_query().where(inArray(funds.id, ids));
  // batch-fetch all members for these funds
  const all_members = await db
    .select({ fund_id: fund_members.fund_id, npo_id: fund_members.npo_id })
    .from(fund_members)
    .where(inArray(fund_members.fund_id, ids))
    .orderBy(fund_members.fund_id, fund_members.position);
  const members_by_fund = new Map<string, number[]>();
  for (const m of all_members) {
    const arr = members_by_fund.get(m.fund_id) ?? [];
    arr.push(m.npo_id);
    members_by_fund.set(m.fund_id, arr);
  }
  return rows.map((r) => row_to_fund(r, members_by_fund.get(r.id) ?? []));
}

export async function funds_list(
  opts: IFundsPageOpts = {}
): Promise<IPageKeyed<IFund>> {
  const limit = opts.limit ?? 10;
  const cursor = decode_date_cursor(opts.next);

  const q = db
    .select()
    .from(funds)
    .orderBy(desc(funds.created_at))
    .limit(limit + 1);

  const rows = cursor
    ? await q.where(sql`${funds.created_at} < ${cursor}`)
    : await q;

  const has_more = rows.length > limit;
  const items = has_more ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  return {
    // target: two columns → one union field; view-derived donation_total_usd
    items: items as unknown as IFund[],
    next:
      has_more && last?.created_at
        ? encode_date_cursor(last.created_at)
        : undefined,
  };
}

export async function fund_put(tx: DbOrTx, data: IFund) {
  const { target, members, ...rest } = data;
  await tx.insert(funds).values({
    ...rest,
    description_v2: to_text(rest.description_pt),
    ...from_target(target),
  });
  if (members.length > 0) {
    await tx
      .insert(fund_members)
      .values(
        members.map((npo_id, i) => ({ fund_id: data.id, npo_id, position: i }))
      );
  }
}

// no lookup sync needed — UNIQUE constraint on slug
export async function fund_update(
  id: string,
  update: IFundUpdate
): Promise<Record<string, unknown>> {
  const { target, description_pt, ...rest } = update;
  const desc_cols = description_pt
    ? {
        description_pt,
        description_v2: to_text(description_pt),
      }
    : {};
  const [row] = await db
    .update(funds)
    .set({
      ...rest,
      ...desc_cols,
      ...(target !== undefined ? from_target(target) : {}),
    })
    .where(eq(funds.id, id))
    .returning();
  return (row as Record<string, unknown>) ?? {};
}

export async function fund_close(id: string) {
  await db.update(funds).set({ active: false }).where(eq(funds.id, id));
}

// CASCADE handles fund_memberships cleanup
export async function fund_delete(id: string) {
  await db.delete(funds).where(eq(funds.id, id));
}

const HITS_PER_PAGE = 25;
const MAX_EXP_UNIX = Math.floor(
  new Date("9999-12-31T23:59:59Z").getTime() / 1000
);

function to_fund_item(r: {
  target_number: number | null;
  target_smart: boolean | null;
  expiration: string | null;
  donation_total_usd: number;
  total?: number;
  [k: string]: unknown;
}): IFundItem {
  const { target_number, target_smart, total: _, expiration, ...rest } = r;
  return {
    ...rest,
    target: to_target(target_number, target_smart),
    expiration: expiration
      ? Math.floor(new Date(expiration).getTime() / 1000)
      : MAX_EXP_UNIX,
    donation_total_usd: Math.round(r.donation_total_usd),
  } as IFundItem;
}

const fund_select = {
  id: funds.id,
  name: funds.name,
  description_pt: funds.description_pt,
  logo: funds.logo,
  banner: funds.banner,
  published: funds.published,
  active: funds.active,
  npo_owner: funds.npo_owner,
  target_number: funds.target_number,
  target_smart: funds.target_smart,
  creator_id: funds.creator_id,
  creator_name: sql<string>`${user.first_name} || ' ' || ${user.last_name}`,
  expiration: funds.expiration,
  donation_total_usd: sql<number>`COALESCE(${v_donation_total_usd.total}, 0)`,
};

// pg_trgm fuzzy search — replaces fetch-all + Fuse.js
export async function fund_search(
  params: IFundsSearchObj
): Promise<IFundItemsPage> {
  const { query: q, page = 1 } = params;

  const conditions: SQL[] = [
    eq(funds.active, true),
    eq(funds.published, true),
    sql`(${funds.expiration} IS NULL OR ${funds.expiration} >= NOW())`,
  ];

  if (q) {
    conditions.push(
      or(
        sql`similarity(${funds.name}, ${q}) > 0.1`,
        sql`similarity(COALESCE(${funds.description_v2}, ''), ${q}) > 0.1`,
        sql`similarity(${user.first_name} || ' ' || ${user.last_name}, ${q}) > 0.1`
      )!
    );
  }

  const rank = q
    ? sql<number>`GREATEST(
        similarity(${funds.name}, ${q}) * 3,
        similarity(COALESCE(${funds.description_v2}, ''), ${q}) * 2,
        similarity(${user.first_name} || ' ' || ${user.last_name}, ${q})
      )`
    : null;

  const rows = await db
    .select({
      ...fund_select,
      total: sql<number>`COUNT(*) OVER()`,
    })
    .from(funds)
    .innerJoin(user, eq(user.id, funds.creator_id))
    .leftJoin(v_donation_total_usd, eq(v_donation_total_usd.fund_id, funds.id))
    .where(and(...conditions))
    .orderBy(rank ? desc(rank) : asc(funds.name))
    .limit(HITS_PER_PAGE)
    .offset((page - 1) * HITS_PER_PAGE);

  const total = rows[0]?.total ?? 0;

  return {
    items: rows.map(to_fund_item),
    page,
    pages: Math.max(1, Math.ceil(total / HITS_PER_PAGE)),
  };
}

export async function fund_npo_memberof(
  endow_id: number,
  params: IFundsNpoMemberOfSearchObj
): Promise<IFundItem[]> {
  // subquery: funds where endow_id is a member
  const is_member = sql`EXISTS (SELECT 1 FROM ${fund_members} WHERE ${fund_members.fund_id} = ${funds.id} AND ${fund_members.npo_id} = ${endow_id})`;

  const conditions: SQL[] =
    params.creator === "ours"
      ? [eq(funds.npo_owner, endow_id)]
      : params.creator === "others"
        ? [
            or(ne(funds.npo_owner, endow_id), isNull(funds.npo_owner))!,
            is_member,
          ]
        : [or(eq(funds.npo_owner, endow_id), is_member)!];

  if (params.published) {
    conditions.push(
      eq(funds.published, true),
      eq(funds.active, true),
      sql`(${funds.expiration} IS NULL OR ${funds.expiration} >= NOW())`
    );
  }

  const rows = await db
    .select(fund_select)
    .from(funds)
    .innerJoin(user, eq(user.id, funds.creator_id))
    .leftJoin(v_donation_total_usd, eq(v_donation_total_usd.fund_id, funds.id))
    .where(and(...conditions))
    .orderBy(desc(funds.created_at));

  return rows.map(to_fund_item);
}

export async function fund_member_remove(
  fund_id: string,
  npo_id: number,
  is_last: boolean
) {
  const [fund] = await db.select().from(funds).where(eq(funds.id, fund_id));
  if (!fund) return;

  await db
    .delete(fund_members)
    .where(
      and(eq(fund_members.fund_id, fund_id), eq(fund_members.npo_id, npo_id))
    );

  if (is_last) {
    await db.update(funds).set({ active: false }).where(eq(funds.id, fund_id));
  }

  return {
    fund_id,
    creator_id: fund.creator_id,
    creator_name: fund.name,
    removed_npo_ids: [npo_id],
  };
}

/** get member npo_ids for a fund */
export async function fund_members_get(fund_id: string): Promise<number[]> {
  const rows = await db
    .select({ npo_id: fund_members.npo_id })
    .from(fund_members)
    .where(eq(fund_members.fund_id, fund_id))
    .orderBy(fund_members.position);
  return rows.map((r) => r.npo_id);
}

/** check if npo is member of fund */
export async function fund_has_member(
  fund_id: string,
  npo_id: number
): Promise<boolean> {
  const [row] = await db
    .select({ npo_id: fund_members.npo_id })
    .from(fund_members)
    .where(
      and(eq(fund_members.fund_id, fund_id), eq(fund_members.npo_id, npo_id))
    );
  return !!row;
}
