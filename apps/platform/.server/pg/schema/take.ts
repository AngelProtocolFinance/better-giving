import { sql } from "drizzle-orm";
import { check, pgTable, text, unique } from "drizzle-orm/pg-core";
import { numeric_as_number, timestamptz_now } from "./columns";
import { donations } from "./donation";

/** what one refund or one dispute took back of a gift's charge, one row
 * each: how much of the charge is gone is the sum of the active ones */
export const donation_takes = pgTable(
  "donation_takes",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    donation_id: text("donation_id")
      .notNull()
      .references(() => donations.id),
    /** the provider's refund id, or the dispute's id; a chargeback recorded
     * before its dispute was filed, its own ref until the filing claims it */
    ref: text("ref").notNull(),
    kind: text("kind").$type<"refund" | "dispute">().notNull(),
    /** this take's own part of the charge */
    share: numeric_as_number("share", { precision: 38, scale: 18 }).notNull(),
    /** what the provider charged for the dispute, in usd */
    fee_usd: numeric_as_number("fee_usd", { precision: 38, scale: 18 })
      .notNull()
      .default(0),
    /** `undone`: the refund failed, or the dispute was won, accepted as a
     * claim the refund pays, or closed as an inquiry: it no longer counts */
    status: text("status")
      .$type<"active" | "undone">()
      .notNull()
      .default("active"),
    /** the dispute it is, once known */
    dispute_id: text("dispute_id"),
    /** the chargeback's own ref, so a redelivered chargeback finds its take */
    chargeback_ref: text("chargeback_ref"),
    created_at: timestamptz_now("created_at"),
  },
  (t) => [
    unique("donation_takes_ref_uniq").on(t.donation_id, t.ref),
    unique("donation_takes_chargeback_ref_uniq").on(
      t.donation_id,
      t.chargeback_ref
    ),
    check("donation_takes_kind_check", sql`${t.kind} IN ('refund','dispute')`),
    check(
      "donation_takes_status_check",
      sql`${t.status} IN ('active','undone')`
    ),
    check(
      "donation_takes_share_check",
      sql`${t.share} > 0 AND ${t.share} <= 1 AND ${t.fee_usd} >= 0`
    ),
    check(
      "donation_takes_refund_check",
      sql`${t.kind} = 'dispute' OR (${t.dispute_id} IS NULL AND ${t.chargeback_ref} IS NULL AND ${t.fee_usd} = 0)`
    ),
    check("donation_takes_ref_check", sql`${t.ref} <> ''`),
  ]
);
