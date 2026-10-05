import { sql } from "drizzle-orm";
import { check, index, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./columns";
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
      .$type<"open" | "lost" | "won" | "inquiry_closed">()
      .notNull(),
    opened_at: timestamptz("opened_at").notNull(),
    closed_at: timestamptz("closed_at"),
  },
  (t) => [
    check(
      "donation_disputes_status_check",
      sql`${t.status} IN ('open','lost','won','inquiry_closed')`
    ),
    check(
      "donation_disputes_closed_check",
      sql`(${t.status} = 'open') = (${t.closed_at} IS NULL)`
    ),
    check("donation_disputes_id_check", sql`${t.id} <> ''`),
    // the donation_id fk's: a donation's delete or key change looks its disputes up by it
    index("donation_disputes_donation_id_idx").on(t.donation_id),
  ]
);
