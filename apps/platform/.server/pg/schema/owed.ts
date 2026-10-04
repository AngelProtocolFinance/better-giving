import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { numeric_as_number, timestamptz } from "./columns";
import { donations } from "./donation";
import { npos } from "./npo";

const usd = (name: string) =>
  numeric_as_number(name, { precision: 38, scale: 18 });

/** what a party owes back on a reversed gift, one row per gift per party, in
 * usd. credited back / recovered / written off are sums of `owed_entries`,
 * each `_at` the latest entry's */
export const owed_amounts = pgTable(
  "owed_amounts",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    donation_id: text("donation_id")
      .notNull()
      .references(() => donations.id),
    /** the party: the gift's beneficiary npo, or its referrer as on `referrer_commissions` */
    npo_id: integer("npo_id").references(() => npos.id),
    referrer_user: text("referrer_user").references(() => user.referral_code),
    referrer_npo: text("referrer_npo").references(() => npos.referral_id),
    source: text("source").$type<"refund" | "dispute">().notNull(),
    /** the provider's refund or dispute id for the first one recorded, or its
     * event id when the caller has none */
    source_ref: text("source_ref").notNull(),
    recorded_at: timestamptz("recorded_at").notNull(),
    received_usd: usd("received_usd").notNull(),
    fee_processing_usd: usd("fee_processing_usd").notNull().default(0),
    fee_dispute_usd: usd("fee_dispute_usd").notNull().default(0),
    credited_back_usd: usd("credited_back_usd").notNull().default(0),
    credited_back_at: timestamptz("credited_back_at"),
    /** net of any due-back paid out, so it falls back when a credit is repaid */
    recovered_usd: usd("recovered_usd").notNull().default(0),
    recovered_at: timestamptz("recovered_at"),
    written_off_usd: usd("written_off_usd").notNull().default(0),
    written_off_at: timestamptz("written_off_at"),
    write_off_reason: text("write_off_reason"),
    written_off_by: text("written_off_by").references(() => user.id),
    /** negative: the party is due that much back */
    outstanding_usd: usd("outstanding_usd").generatedAlwaysAs(
      sql`received_usd + fee_processing_usd + fee_dispute_usd - credited_back_usd - recovered_usd - written_off_usd`
    ),
  },
  (t) => [
    check(
      "owed_amounts_party_xor",
      sql`num_nonnulls(${t.npo_id}, ${t.referrer_user}, ${t.referrer_npo}) = 1`
    ),
    // the absent party columns are null, so distinct nulls would admit a second row per party
    unique("owed_amounts_donation_party_uniq")
      .on(t.donation_id, t.npo_id, t.referrer_user, t.referrer_npo)
      .nullsNotDistinct(),
    check(
      "owed_amounts_source_check",
      sql`${t.source} IN ('refund','dispute')`
    ),
    check("owed_amounts_source_ref_check", sql`${t.source_ref} <> ''`),
    check(
      "owed_amounts_figures_check",
      sql`${t.received_usd} >= 0 AND ${t.fee_processing_usd} >= 0 AND ${t.fee_dispute_usd} >= 0
        AND ${t.credited_back_usd} >= 0 AND ${t.recovered_usd} >= 0 AND ${t.written_off_usd} >= 0`
    ),
    // recovered is left out of the credited sum: recovering, then crediting
    // back, is how a party comes to be due money back. what was written off
    // is no longer there to recover
    check(
      "owed_amounts_settled_within_owed_check",
      sql`${t.credited_back_usd} + ${t.written_off_usd}
          <= ${t.received_usd} + ${t.fee_processing_usd} + ${t.fee_dispute_usd}
        AND ${t.recovered_usd} + ${t.written_off_usd} <= ${t.received_usd} + ${t.fee_processing_usd} + ${t.fee_dispute_usd}`
    ),
    check(
      "owed_amounts_credit_dated_check",
      sql`${t.credited_back_usd} = 0 OR ${t.credited_back_at} IS NOT NULL`
    ),
    check(
      "owed_amounts_recovery_dated_check",
      sql`${t.recovered_usd} = 0 OR ${t.recovered_at} IS NOT NULL`
    ),
    check(
      "owed_amounts_write_off_check",
      sql`num_nonnulls(${t.written_off_at}, ${t.write_off_reason}, ${t.written_off_by}) IN (0, 3)
        AND (${t.written_off_usd} = 0 OR ${t.written_off_at} IS NOT NULL)
        AND btrim(${t.write_off_reason}) <> ''`
    ),
    // the grant run's read: each npo's rows still owed or due back
    index("owed_amounts_npo_outstanding_idx")
      .on(t.npo_id)
      .where(sql`${t.npo_id} IS NOT NULL AND ${t.outstanding_usd} <> 0`),
  ]
);

/** each credit, recovery or write-off against an owed row; the row's
 * credited / recovered / written-off figures are these entries' sums */
export const owed_entries = pgTable(
  "owed_entries",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    owed_id: text("owed_id")
      .notNull()
      .references(() => owed_amounts.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"credit" | "recover" | "write_off">().notNull(),
    usd: usd("usd").notNull(),
    reason: text("reason").notNull(),
    /** what the entry answers to (a payout, a grant run, a dispute); a second
     * entry of one kind under one ref is a retry */
    ref: text("ref").notNull(),
    at: timestamptz("at").notNull(),
    actor: text("actor").references(() => user.id),
  },
  (t) => [
    unique("owed_entries_owed_kind_ref_uniq").on(t.owed_id, t.kind, t.ref),
    check(
      "owed_entries_kind_check",
      sql`${t.kind} IN ('credit','recover','write_off')`
    ),
    check("owed_entries_usd_check", sql`${t.usd} > 0`),
    check("owed_entries_reason_check", sql`btrim(${t.reason}) <> ''`),
    check("owed_entries_ref_check", sql`${t.ref} <> ''`),
  ]
);
