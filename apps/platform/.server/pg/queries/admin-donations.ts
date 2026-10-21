import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { OFFLINE_SOURCE } from "@/donations/offline";
import type { IDonationsSearch } from "@/donations/schema";
import { db } from "../db";
import {
  donation_donors,
  donation_recipients,
  donations,
} from "../schema/donation";
import { npos } from "../schema/npo";
import { type INpoDonation, npo_donations } from "./dist";
import { decode_cursor, encode_cursor, type IPage } from "./helpers";

/**
 * Admin donations list. `npo_donations` stays the dist ledger (Zapier reads
 * it). Hand-recorded gifts have no dist, so this merges them in for the
 * screen only.
 */
function read_admin_cursor(
  next?: string
): { at: string; id: string } | undefined {
  if (!next) return undefined;
  try {
    const raw = decode_cursor(next);
    if (typeof raw?.at === "string" && typeof raw?.id === "string") {
      return { at: raw.at, id: raw.id };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function npo_admin_donations(
  npo_id: number,
  opts?: IDonationsSearch
): Promise<IPage<INpoDonation>> {
  const { limit = 10, date_start, date_end } = opts || {};
  const keyset = read_admin_cursor(opts?.next);
  const [settled, hand] = await Promise.all([
    npo_donations(npo_id, { limit, date_start, date_end, keyset }),
    offline_donations(npo_id, opts, keyset),
  ]);
  const merged = [...settled.items, ...hand.items].sort((a, b) => {
    const by_date = Date.parse(b.date_created) - Date.parse(a.date_created);
    if (by_date !== 0) return by_date;
    return a.id < b.id ? 1 : -1;
  });
  const items = merged.slice(0, limit);
  const last = items[items.length - 1];
  const more = merged.length > limit || Boolean(settled.next) || hand.more;
  return {
    items,
    next:
      more && last
        ? encode_cursor({ at: last.date_created, id: last.id })
        : undefined,
  };
}

/** USD total of hand-recorded gifts. Not a balance. */
export async function recorded_by_hand_usd(npo_id: number): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${donations.amount_base} / nullif(${donations.upusd}, 0)), 0)::text`,
    })
    .from(donations)
    .innerJoin(
      donation_recipients,
      eq(donation_recipients.donation_id, donations.id)
    )
    .where(
      and(
        eq(donations.source, OFFLINE_SOURCE),
        eq(donations.status, "settled"),
        eq(donation_recipients.npo_id, npo_id)
      )
    );
  return Number(row?.total ?? 0);
}

async function offline_donations(
  npo_id: number,
  opts: IDonationsSearch | undefined,
  keyset: { at: string; id: string } | undefined
): Promise<{ items: INpoDonation[]; more: boolean }> {
  const { limit = 10, date_start, date_end } = opts || {};
  const rows = await db
    .select({
      id: donations.id,
      created_at: donations.created_at,
      upusd: donations.upusd,
      amount_base: donations.amount_base,
      frequency: donations.frequency,
      via: donations.via,
      source: donations.source,
      email: donation_donors.email,
      name: donation_donors.name,
      npo_name: npos.name,
    })
    .from(donations)
    .innerJoin(
      donation_recipients,
      eq(donation_recipients.donation_id, donations.id)
    )
    .innerJoin(donation_donors, eq(donation_donors.donation_id, donations.id))
    .innerJoin(npos, eq(npos.id, donation_recipients.npo_id))
    .where(
      and(
        eq(donations.source, OFFLINE_SOURCE),
        eq(donations.status, "settled"),
        eq(donation_recipients.npo_id, npo_id),
        date_start ? gte(donations.created_at, date_start) : undefined,
        date_end ? lte(donations.created_at, date_end) : undefined,
        keyset
          ? sql`(${donations.created_at}, ${donations.id}) < (${keyset.at}::timestamptz, ${keyset.id})`
          : undefined
      )
    )
    .orderBy(desc(donations.created_at), desc(donations.id))
    .limit(limit + 1);

  const more = rows.length > limit;
  return {
    more,
    items: rows.slice(0, limit).map((row) => offline_row(row, npo_id)),
  };
}

function hand_email(email: string): string {
  if (email.startsWith("hand-") && email.endsWith("@recorded.invalid"))
    return "";
  return email;
}

function offline_row(
  row: {
    id: string;
    created_at: string;
    upusd: number;
    amount_base: number;
    frequency: string;
    via: string;
    source: string;
    email: string;
    name: string | null;
    npo_name: string;
  },
  npo_id: number
): INpoDonation {
  return {
    id: row.id,
    donation_id: row.id,
    status: "settled",
    date_created: row.created_at,
    to_id: npo_id,
    to_name: row.npo_name,
    to_fiscal_sponsored: false,
    amount: row.amount_base,
    amount_usd: row.upusd ? row.amount_base / row.upusd : 0,
    amount_denom: "USD",
    net: row.upusd ? row.amount_base / row.upusd : 0,
    fee_base: 0,
    fee_fsa: 0,
    fee_processing: 0,
    fee_allowance: 0,
    fee_allowance_excess: 0,
    fund_id: null,
    alloc: null,
    refund_status: null,
    refund_error: null,
    notice_claimed_at: null,
    notice_sent_at: null,
    metric_counted_at: null,
    hooks_sent_at: null,
    stripe_routed_to: null,
    stripe_transfer_id: null,
    stripe_transfer_created_at: null,
    refunds_cut_share: null,
    settled_net: null,
    frequency: row.frequency,
    via: row.via,
    source: row.source,
    form_id: null,
    form_name: null,
    form_tag: null,
    program_id: null,
    program_name: null,
    from_email: hand_email(row.email),
    from_name: row.name,
    from_company: null,
    from_addr: null,
    sttl_id: null,
    sttl_date: null,
    sttl_currency: null,
  };
}
