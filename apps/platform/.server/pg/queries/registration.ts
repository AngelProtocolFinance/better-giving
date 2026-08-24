import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  like,
  lte,
  or,
  sql,
} from "drizzle-orm";
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

/** records a signing packet, and only onto the row it was generated from.
 * returns nothing when the row has moved on — the packet is orphaned, and the
 * caller has to start the agreement again rather than record it.
 *
 * `updated_at` is the version column: anvil mints the packet over the network,
 * and an identity or contact reset committing during that call would be undone
 * by an id-only write, putting a signing url and an eid back onto an identity
 * the packet does not assert. `reg_fsa_signed` would then accept that
 * packet's completion, since the eid it compares against is the restored
 * one. */
export async function reg_fsa_packet(
  id: string,
  seen_at: string,
  attrs: Record<string, any>
) {
  const [row] = await db
    .update(registrations)
    .set({ ...attrs, updated_at: new Date().toISOString() })
    .where(and(eq(registrations.id, id), eq(registrations.updated_at, seen_at)))
    .returning();
  return row;
}

/** records the signed agreement, and only for the packet the row is still
 * waiting on. returns nothing when it is not — the caller has a superseded
 * packet, not a failure.
 *
 * the predicate belongs in the statement rather than a caller's `if`, because
 * anvil's webhook races the reset paths: an identity or contact change
 * committing between a read and this write would be undone, putting the row
 * back to signed and re-opening the superseded document, since
 * `is_fsa_doc_eid` matches a signed url by its last path segment.
 *
 * a row predating `o_fsa_doc_eid` has no eid to compare against, so it is
 * recognised by the signing url those same paths clear. */
export async function reg_fsa_signed(id: string, doc_eid: string, url: string) {
  const [row] = await db
    .update(registrations)
    .set({
      o_fsa_signed_doc_url: url,
      status: "01",
      updated_at: new Date().toISOString(),
    })
    .where(
      and(
        eq(registrations.id, id),
        or(
          eq(registrations.o_fsa_doc_eid, doc_eid),
          and(
            isNull(registrations.o_fsa_doc_eid),
            isNotNull(registrations.o_fsa_signing_url)
          )
        )
      )
    )
    .returning();
  return row;
}

/** whether `eid` names a fund services agreement of ours.
 *
 * two records can carry it, and a row has one or the other:
 *
 * - `o_fsa_doc_eid`, stamped when the etch packet is CREATED — early enough
 *   that the success page anvil redirects to resolves, which a record written
 *   by the etch-complete webhook is not.
 * - the download url that webhook writes, whose last path segment is the eid.
 *   matched as a suffix because the origin half differs between staging and
 *   production, and it is what rows without the column are found by, so none
 *   of them needs a backfill. the eid arrives off a url path, so its `like`
 *   metacharacters are escaped: unescaped, a bare `%` would match every row
 *   that has ever signed one. */
export async function is_fsa_doc_eid(eid: string): Promise<boolean> {
  const suffix = eid.replace(/([%_\\])/g, "\\$1");
  const [row] = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      or(
        eq(registrations.o_fsa_doc_eid, eid),
        like(registrations.o_fsa_signed_doc_url, `%/${suffix}`)
      )
    )
    .limit(1);
  return !!row;
}
