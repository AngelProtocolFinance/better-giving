import { and, asc, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import type { IReg, IRegNew, IRegsSearchObj } from "@/reg/schema";
import { db } from "../db";
import { registrations } from "../schema/registration";
import type { DbOrTx, IPage } from "./helpers";
import { decode_date_cursor, encode_date_cursor } from "./helpers";

export async function reg_get(id: string): Promise<IReg | undefined> {
  const [row] = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, id));
  // IReg is composed of many sub-interfaces with field shape mismatches
  return row as unknown as IReg | undefined;
}

/** the applicant's own application, most recently touched first.
 *
 * keyed on the address the row was written under, so a caller who can only
 * prove *who they are* — a draft grant, no session, no reference to quote —
 * still reaches nothing but their own. an applicant with several rows is
 * handed the one they were last working on. */
export async function reg_latest(r_id: string): Promise<IReg | undefined> {
  const [row] = await db
    .select()
    .from(registrations)
    .where(eq(registrations.r_id, r_id))
    .orderBy(desc(registrations.updated_at))
    .limit(1);
  // IReg is composed of many sub-interfaces with field shape mismatches
  return row as unknown as IReg | undefined;
}

export async function reg_put(data: IRegNew): Promise<string> {
  const id = globalThis.crypto.randomUUID();
  const now = new Date().toISOString();

  const row = {
    id,
    r_id: data.r_id,
    status: "01" as const,
    // o_type travels with its identity column and hq country — see `reg_new`
    ...(data.o_type === "501c3"
      ? {
          o_type: data.o_type,
          o_ein: data.o_ein,
          o_hq_country: data.o_hq_country,
        }
      : {
          o_type: data.o_type,
          o_hq_country: data.o_hq_country,
          o_registration_number: data.o_registration_number,
        }),
    ...(data.o_name && { o_name: data.o_name }),
    ...(data.referrer && {
      rm: "referral",
      rm_referral_code: data.referrer,
    }),
    created_at: now,
    updated_at: now,
  };

  await db
    .insert(registrations)
    .values(row as typeof registrations.$inferInsert);

  return id;
}

export async function reg_update(
  db: DbOrTx,
  id: string,
  attrs: Record<string, any>
) {
  const { update_type: _, ...rest } = attrs;
  const [row] = await db
    .update(registrations)
    .set({ ...rest, updated_at: new Date().toISOString() })
    .where(eq(registrations.id, id))
    .returning();
  return row;
}

/** paginated registrations with status/date/country filters */
export async function regs(opts?: IRegsSearchObj): Promise<IPage<IReg>> {
  const {
    status = "02",
    start_date,
    end_date,
    country,
    next,
    query,
    sort_key = "updated_at",
    sort_dir = "desc",
  } = opts || {};

  const cursor = decode_date_cursor(next);

  const sort_col_map = {
    o_name: registrations.o_name,
    updated_at: registrations.updated_at,
    o_hq_country: registrations.o_hq_country,
    status: registrations.status,
  } as const;
  const col = sort_col_map[sort_key];
  const order = sort_dir === "asc" ? asc(col) : desc(col);

  const rows = await db
    .select()
    .from(registrations)
    .where(
      and(
        status ? eq(registrations.status, status) : undefined,
        start_date
          ? gte(registrations.updated_at, new Date(start_date).toISOString())
          : undefined,
        end_date
          ? lte(registrations.updated_at, new Date(end_date).toISOString())
          : undefined,
        country ? eq(registrations.o_hq_country, country) : undefined,
        query
          ? or(
              sql`similarity(${registrations.o_name}, ${query}) > 0.1`,
              sql`${registrations.id} ILIKE ${`%${query}%`}`
            )
          : undefined,
        cursor ? sql`${registrations.updated_at} < ${cursor}` : undefined
      )
    )
    .orderBy(order)
    .limit(16);

  const has_more = rows.length > 15;
  const items = rows.slice(0, 15);
  return {
    // IReg is composed of many sub-interfaces with field shape mismatches
    items: items as unknown as IReg[],
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.updated_at ?? undefined)
      : undefined,
  };
}
