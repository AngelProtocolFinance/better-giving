import { sql } from "drizzle-orm";
import { check, index, pgTable, text } from "drizzle-orm/pg-core";
import { numeric_as_number, timestamptz } from "./columns";
import { donations } from "./donation";

/** a chargeback on a gift, as its provider reports it */
export const donation_disputes = pgTable(
  "donation_disputes",
  {
    /** the provider's dispute id: a redelivered event lands on the same row */
    id: text("id").primaryKey(),
    donation_id: text("donation_id")
      .notNull()
      .references(() => donations.id),
    status: text("status")
      .$type<"open" | "lost" | "won" | "inquiry_closed" | "accepted">()
      .notNull(),
    opened_at: timestamptz("opened_at").notNull(),
    closed_at: timestamptz("closed_at"),
    /** mirrors of the dispute's take on the gift's ledger as its open left
     * it: its own part of the charge and its fee in usd. null while it has
     * no take. what is owed is read off the ledger, never off these */
    share: numeric_as_number("share", { precision: 38, scale: 18 }),
    fee_usd: numeric_as_number("fee_usd", { precision: 38, scale: 18 }),
    /** a mirror too: what the gift's takes took when it opened */
    cumulative_share: numeric_as_number("cumulative_share", {
      precision: 38,
      scale: 18,
    }),
    /** no longer written: the ledger's take carries the chargeback's own ref */
    loss_recorded_at: timestamptz("loss_recorded_at"),
  },
  (t) => [
    check(
      "donation_disputes_status_check",
      sql`${t.status} IN ('open','lost','won','inquiry_closed','accepted')`
    ),
    check(
      "donation_disputes_closed_check",
      sql`(${t.status} = 'open') = (${t.closed_at} IS NULL)`
    ),
    check("donation_disputes_id_check", sql`${t.id} <> ''`),
    check(
      "donation_disputes_share_check",
      sql`num_nonnulls(${t.share}, ${t.fee_usd}) IN (0, 2)
        AND ${t.share} > 0 AND ${t.share} <= 1 AND ${t.fee_usd} >= 0`
    ),
    check(
      "donation_disputes_cumulative_share_check",
      sql`${t.cumulative_share} IS NULL OR (${t.share} IS NOT NULL
        AND ${t.cumulative_share} >= ${t.share} AND ${t.cumulative_share} <= 1)`
    ),
    // the donation_id fk's: a donation's delete or key change looks its disputes up by it
    index("donation_disputes_donation_id_idx").on(t.donation_id),
  ]
);
