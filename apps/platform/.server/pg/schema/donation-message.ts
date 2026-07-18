import { index, pgTable, text } from "drizzle-orm/pg-core";
import { numeric_as_number, timestamptz } from "./columns";

export const donation_messages = pgTable(
  "donation_messages",
  {
    id: text("id").primaryKey(),
    donation_id: text("donation_id"),
    npo_id: text("npo_id"),
    donor_name: text("donor_name"),
    donor_message: text("donor_message"),
    date: timestamptz("date"),
    amount: numeric_as_number("amount", { precision: 38, scale: 18 }),
  },
  (t) => [index("donation_messages_npo_id_date_idx").on(t.npo_id, t.date)]
);
