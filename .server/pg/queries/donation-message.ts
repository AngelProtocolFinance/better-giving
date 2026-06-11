import { desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "../db";
import { user } from "../schema/auth";
import { donation_donors } from "../schema/donation";
import { donation_messages } from "../schema/donation-message";
import type { DbOrTx, IPage } from "./helpers";
import { decode_date_cursor, encode_date_cursor } from "./helpers";

export async function donation_message_put(
  db: DbOrTx,
  data: typeof donation_messages.$inferInsert
) {
  await db.insert(donation_messages).values(data);
}

export async function donation_message_del(db: DbOrTx, id: string) {
  await db.delete(donation_messages).where(eq(donation_messages.id, id));
}

type DonationMessageRow = typeof donation_messages.$inferSelect & {
  donor_email: string | null;
  avatar_url: string | null;
};

export async function donation_message_list(
  npo_id: string,
  opts?: { limit?: number; next?: string }
): Promise<IPage<DonationMessageRow>> {
  const { limit = 10, next } = opts || {};
  const cursor = decode_date_cursor(next);

  const rows = await db
    .select({
      ...getTableColumns(donation_messages),
      donor_email: donation_donors.email,
      avatar_url: user.avatar_url,
    })
    .from(donation_messages)
    .leftJoin(
      donation_donors,
      eq(donation_messages.donation_id, donation_donors.donation_id)
    )
    .leftJoin(user, eq(donation_donors.email, user.email))
    .where(
      sql`${donation_messages.npo_id} = ${npo_id}${cursor ? sql` AND ${donation_messages.date} < ${cursor}` : sql``}`
    )
    .orderBy(desc(donation_messages.date))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = rows.slice(0, limit);
  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.date ?? undefined)
      : undefined,
  };
}
