import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "$/pg/db";
import { decode_date_cursor, encode_date_cursor } from "$/pg/queries/helpers";
import {
  donation_donors,
  donation_recipients,
  donation_settlements,
  donations,
} from "$/pg/schema/donation";
import { npos } from "$/pg/schema/npo";
import type { Route } from "./+types/route";

export interface PaymentRow {
  id: string;
  donation_id: string;
  amount_base: number;
  amount_tip: number;
  amount_fee_allowance: number;
  currency: string;
  email: string | null;
  npo_name: string | null;
  sttl_fee: number | null;
  sttl_currency: string | null;
  via: string;
  created_at: string;
  status: string;
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { searchParams: s } = new URL(request.url);
  const cursor = s.get("cursor") || undefined;
  const limit = 20;

  const decoded = decode_date_cursor(cursor);

  const rows = await db
    .select({
      id: donations.id,
      donation_id: donations.id,
      amount_base: donations.amount_base,
      amount_tip: donations.amount_tip,
      amount_fee_allowance: donations.amount_fee_allowance,
      currency: donations.currency,
      email: donation_donors.email,
      npo_name: npos.name,
      sttl_fee: donation_settlements.fee,
      sttl_currency: donation_settlements.currency,
      via: donations.via,
      created_at: donations.created_at,
      status: donations.status,
    })
    .from(donations)
    .leftJoin(donation_donors, eq(donations.id, donation_donors.donation_id))
    .leftJoin(
      donation_recipients,
      eq(donations.id, donation_recipients.donation_id)
    )
    .leftJoin(npos, eq(donation_recipients.npo_id, npos.id))
    .leftJoin(
      donation_settlements,
      eq(donations.id, donation_settlements.donation_id)
    )
    .where(
      and(
        inArray(donations.status, ["settled", "refunded"]),
        decoded ? sql`${donations.created_at} < ${decoded}` : undefined
      )
    )
    .orderBy(desc(donations.created_at))
    .limit(limit + 1);

  const has_more = rows.length > limit;
  const items = rows.slice(0, limit);

  return {
    items,
    next: has_more
      ? encode_date_cursor(items[items.length - 1]?.created_at)
      : undefined,
  };
};
