import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "../db";
import { user } from "../schema/auth";
import { donation_donors, donations } from "../schema/donation";
import { donation_messages } from "../schema/donation-message";
import type { DbOrTx, IPage } from "./helpers";
import { decode_date_cursor, encode_date_cursor } from "./helpers";
import { message_amount_usd } from "./message-amount";

export async function donation_message_put(
  db: DbOrTx,
  data: typeof donation_messages.$inferInsert
) {
  await db.insert(donation_messages).values(data);
}

export async function donation_message_del(db: DbOrTx, id: string) {
  await db.delete(donation_messages).where(eq(donation_messages.id, id));
}

/** `date` isn't unique — rows written in one instant tie, and a date-only
 * `< cursor` drops every tied row past the page edge. `id` breaks the tie,
 * carried as `<iso>|<id>` through the date cursor's base64url (an iso date has
 * no pipe). a cursor without one is a date-only cursor an older client still
 * holds, and pages as it always did: strictly older rows. */
function message_keyset(next?: string) {
  const raw = decode_date_cursor(next);
  if (!raw) return undefined;
  const pipe = raw.indexOf("|");
  if (pipe < 0) return sql`${donation_messages.date} < ${raw}`;
  const date = raw.slice(0, pipe);
  const id = raw.slice(pipe + 1);
  return sql`(${donation_messages.date}, ${donation_messages.id}) < (${date}::timestamptz, ${id}::text)`;
}

type DonationMessageRow = typeof donation_messages.$inferSelect & {
  donor_email: string | null;
  avatar_url: string | null;
};

export async function donation_message_list(
  npo_id: string,
  opts?: { limit?: number; next?: string; campaign_id?: string }
): Promise<IPage<DonationMessageRow>> {
  const { limit = 10, next, campaign_id } = opts || {};
  const rows = await db
    .select({
      ...getTableColumns(donation_messages),
      donor_email: donation_donors.email,
      avatar_url: user.avatar_url,
      upusd: donations.upusd,
    })
    .from(donation_messages)
    .leftJoin(
      donation_donors,
      eq(donation_messages.donation_id, donation_donors.donation_id)
    )
    .leftJoin(user, eq(donation_donors.email, user.email))
    .leftJoin(donations, eq(donation_messages.donation_id, donations.id))
    .where(
      and(
        eq(donation_messages.npo_id, npo_id),
        campaign_id ? eq(donations.campaign_id, campaign_id) : undefined,
        message_keyset(next)
      )
    )
    .orderBy(desc(donation_messages.date), desc(donation_messages.id))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = rows.slice(0, limit).map(({ upusd, ...row }) => ({
    ...row,
    amount: message_amount_usd(row.amount, upusd),
  }));
  const last = items[items.length - 1];
  return {
    items,
    next:
      has_more && last?.date
        ? encode_date_cursor(`${last.date}|${last.id}`)
        : undefined,
  };
}
