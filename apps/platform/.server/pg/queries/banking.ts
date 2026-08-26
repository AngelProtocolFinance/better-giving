import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { IBappsOpts } from "@/banking";
import type { TStatus } from "@/banking/schema";
import { db } from "../db";
import { banking_apps } from "../schema/banking";
import type { DbOrTx, IPage } from "./helpers";
import { decode_date_cursor, encode_date_cursor } from "./helpers";

type Bapp = typeof banking_apps.$inferSelect;
type BappInsert = typeof banking_apps.$inferInsert;

export async function bapp_get(id: string) {
  const [row] = await db
    .select()
    .from(banking_apps)
    .where(eq(banking_apps.id, id));
  return row;
}

export async function npo_bapps(
  npo_id: number,
  opts?: { limit?: number; next?: string }
) {
  const { limit = 10, next } = opts || {};
  const cursor = decode_date_cursor(next);

  const rows = await db
    .select()
    .from(banking_apps)
    .where(
      and(
        eq(banking_apps.npo_id, npo_id),
        cursor ? sql`${banking_apps.date_created} < ${cursor}` : undefined
      )
    )
    .orderBy(desc(banking_apps.date_created))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = rows.slice(0, limit);
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date_created ?? undefined)
      : undefined,
  } satisfies IPage<Bapp>;
}

export async function npo_bapp_count(npo_id: number) {
  const [row] = await db
    .select({ c: count() })
    .from(banking_apps)
    .where(eq(banking_apps.npo_id, npo_id));
  return row?.c ?? 0;
}

export async function npo_default_bapp(npo_id: number) {
  const [row] = await db
    .select()
    .from(banking_apps)
    .where(
      and(eq(banking_apps.npo_id, npo_id), eq(banking_apps.status, "default"))
    )
    .limit(1);
  return row;
}

interface BappCursor {
  updated_at: string;
  /** empty on a cursor issued before the tie-breaker existed */
  id: string;
}

/** `updated_at` is not unique — `bapp_set_default` stamps two rows with one
 * instant, and the backfill gave every pre-existing row its submission time.
 * a timestamp-only cursor drops every tied row that fell past the page edge,
 * since the next page's `< cursor` rejects them all. `id` breaks the tie.
 *
 * carried as `<iso>|<id>` through the same base64url pair the date cursor uses
 * — neither field can contain a pipe, and a decoded value without one is a
 * cursor issued by an older deploy, read on the legacy path below rather than
 * throwing. `encode_cursor`'s json form is `Buffer`-based and unavailable in
 * the browser test env. */
function encode_bapp_cursor(c: BappCursor) {
  return encode_date_cursor(`${c.updated_at}|${c.id}`);
}

function decode_bapp_cursor(next?: string): BappCursor | undefined {
  const raw = decode_date_cursor(next);
  if (!raw) return undefined;
  const [updated_at, id = ""] = raw.split("|");
  return { updated_at, id };
}

/** the admin list: keyed on `updated_at` so a verdict on an old submission
 * surfaces as recent, which submission date can never do. */
export async function bapps_by_status(
  status: TStatus | TStatus[] | undefined,
  opts?: IBappsOpts
) {
  const { limit = 15, next, npo_id } = opts || {};
  const cursor = decode_bapp_cursor(next);

  const status_filter = Array.isArray(status)
    ? inArray(banking_apps.status, status)
    : status
      ? eq(banking_apps.status, status)
      : undefined;

  // a legacy cursor names an instant but not which of its ties were already
  // served, so it takes `<=`: everything at the boundary comes back, the ones
  // the previous page showed included. a repeated row is visible and harmless;
  // a dropped one is neither. bounded to a single page — the cursor this
  // response issues carries an id, so the next request is back on the row
  // comparison.
  const keyset = !cursor
    ? undefined
    : cursor.id
      ? sql`(${banking_apps.updated_at}, ${banking_apps.id}) < (${cursor.updated_at}::timestamptz, ${cursor.id}::text)`
      : sql`${banking_apps.updated_at} <= ${cursor.updated_at}::timestamptz`;

  const rows = await db
    .select()
    .from(banking_apps)
    .where(
      and(
        status_filter,
        npo_id ? eq(banking_apps.npo_id, npo_id) : undefined,
        keyset
      )
    )
    .orderBy(desc(banking_apps.updated_at), desc(banking_apps.id))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    next:
      has_more && last
        ? encode_bapp_cursor({ updated_at: last.updated_at, id: last.id })
        : undefined,
  } satisfies IPage<Bapp>;
}

export async function bapp_put(db: DbOrTx, data: BappInsert) {
  await db.insert(banking_apps).values(data);
}

export async function bapp_update_status(
  id: string,
  update: { status: TStatus; rejection_reason?: string }
) {
  const [prev] = await db
    .select()
    .from(banking_apps)
    .where(eq(banking_apps.id, id));
  await db
    .update(banking_apps)
    .set({
      status: update.status,
      rejection_reason: update.rejection_reason ?? "",
      updated_at: new Date().toISOString(),
    })
    .where(eq(banking_apps.id, id));

  return prev;
}

/** set one bapp as default, demoting any existing default for the npo */
export async function bapp_set_default(id: string, npo_id: number) {
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    // demote existing default
    await tx
      .update(banking_apps)
      .set({ status: "approved", updated_at: now })
      .where(
        and(
          eq(banking_apps.npo_id, npo_id),
          eq(banking_apps.status, "default"),
          sql`${banking_apps.id} != ${id}`
        )
      );

    // promote target
    await tx
      .update(banking_apps)
      .set({ status: "default", updated_at: now })
      .where(eq(banking_apps.id, id));
  });
}

export async function bapp_delete(id: string) {
  await db.delete(banking_apps).where(eq(banking_apps.id, id));
}
