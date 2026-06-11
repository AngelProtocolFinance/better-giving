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

export async function bapps_by_status(
  status: TStatus | TStatus[] | undefined,
  opts?: IBappsOpts
) {
  const { limit = 15, next } = opts || {};
  const cursor = decode_date_cursor(next);

  const status_filter = Array.isArray(status)
    ? inArray(banking_apps.status, status)
    : status
      ? eq(banking_apps.status, status)
      : undefined;

  const rows = await db
    .select()
    .from(banking_apps)
    .where(
      and(
        status_filter,
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
    })
    .where(eq(banking_apps.id, id));

  return prev;
}

/** set one bapp as default, demoting any existing default for the npo */
export async function bapp_set_default(id: string, npo_id: number) {
  await db.transaction(async (tx) => {
    // demote existing default
    await tx
      .update(banking_apps)
      .set({ status: "approved" })
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
      .set({ status: "default" })
      .where(eq(banking_apps.id, id));
  });
}

export async function bapp_delete(id: string) {
  await db.delete(banking_apps).where(eq(banking_apps.id, id));
}
