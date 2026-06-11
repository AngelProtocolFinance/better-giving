import { and, desc, eq, sql } from "drizzle-orm";
import type { IMedia } from "@/npo";
import type { IMediaSearchObj, IMediaUpdate } from "@/npo/schema";
import { db } from "../db";
import { npo_media } from "../schema/npo";
import type { IPage } from "./helpers";
import { decode_date_cursor, encode_date_cursor } from "./helpers";

export async function npo_media_list(
  npo_id: number,
  opts: IMediaSearchObj
): Promise<IPage<IMedia>> {
  const { limit = 10, next, type, featured } = opts;
  const cursor = decode_date_cursor(next);

  const rows = await db
    .select()
    .from(npo_media)
    .where(
      and(
        eq(npo_media.npo_id, npo_id),
        type ? eq(npo_media.type, type) : undefined,
        featured !== undefined ? eq(npo_media.featured, featured) : undefined,
        cursor ? sql`${npo_media.date_created} < ${cursor}` : undefined
      )
    )
    .orderBy(desc(npo_media.date_created))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = rows.slice(0, limit) as unknown as IMedia[];
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date_created ?? undefined)
      : undefined,
  };
}

export async function npo_media_get(mid: string): Promise<IMedia | undefined> {
  const [row] = await db.select().from(npo_media).where(eq(npo_media.id, mid));
  return row as unknown as IMedia | undefined;
}

export async function npo_media_put(
  npo_id: number,
  url: string
): Promise<string> {
  const mid = crypto.randomUUID();
  await db.insert(npo_media).values({
    id: mid,
    npo_id,
    featured: false,
    url,
    type: "video",
    date_created: new Date().toISOString(),
  });
  return mid;
}

export async function npo_media_update(
  npo_id: number,
  mid: string,
  update: IMediaUpdate
) {
  await db
    .update(npo_media)
    .set({
      ...(update.url !== undefined ? { url: update.url } : {}),
      ...(update.featured !== undefined ? { featured: update.featured } : {}),
    })
    .where(and(eq(npo_media.id, mid), eq(npo_media.npo_id, npo_id)));
}

export async function npo_media_delete(npo_id: number, mid: string) {
  await db
    .delete(npo_media)
    .where(and(eq(npo_media.id, mid), eq(npo_media.npo_id, npo_id)));
}
