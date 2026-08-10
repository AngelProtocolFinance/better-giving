import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core";
import type { IAddr } from "@/types/donation";
import { numeric_as_number, timestamptz, timestamptz_now } from "./columns";
import { forms } from "./form";
import { funds } from "./fund";
import { npos } from "./npo";
import { subscriptions } from "./subscription";

export const donations = pgTable(
  "donations",
  {
    id: text("id").primaryKey(),
    id_v1: text("id_v1"),
    upusd: numeric_as_number("upusd", { precision: 38, scale: 18 }).notNull(),
    status: text("status").notNull(),
    amount_base: numeric_as_number("amount_base", {
      precision: 38,
      scale: 18,
    }).notNull(),
    amount_tip: numeric_as_number("amount_tip", {
      precision: 38,
      scale: 18,
    }).notNull(),
    amount_fee_allowance: numeric_as_number("amount_fee_allowance", {
      precision: 38,
      scale: 18,
    }).notNull(),
    currency: text("currency").notNull(),
    frequency: text("frequency").notNull(),
    source: text("source").notNull(),
    via: text("via").notNull(),
    source_id: text("source_id"),
    form_id: text("form_id").references(() => forms.id),
    via_extra: text("via_extra"),
    program_id: text("program_id"),
    program_name: text("program_name"),
    subscription_id: text("subscription_id").references(() => subscriptions.id),
    // the receipt mails are gated by a two-stamp lease. `claimed` is taken
    // before the sends and `sent` written after them, because one column
    // cannot answer both "is someone mailing this right now" and "did the mail
    // go out" — and a worker killed between the two would leave a single stamp
    // asserting a receipt that was never sent, with nothing able to tell the
    // difference later.
    //
    // `claimed` alone is therefore reclaimable once it is stale; `sent` never
    // is. the queue delivers at-least-once and a receipt carries a tax id
    // minted at send time, so a redelivery past a real send would hand the
    // donor a second number for one gift.
    receipt_claimed_at: timestamptz("receipt_claimed_at"),
    receipt_sent_at: timestamptz("receipt_sent_at"),
    created_at: timestamptz_now("created_at"),
    updated_at: timestamptz_now("updated_at"),
  },
  (t) => [
    check(
      "status_check",
      sql`${t.status} IN ('created','intent','expired','confirmed','settled','failed','refunded','refunded_loss','cancelled')`
    ),
    index("donations_form_id_idx").on(t.form_id),
    index("donations_subscription_id_idx").on(t.subscription_id),
  ]
);

export const donation_recipients = pgTable(
  "donation_recipients",
  {
    donation_id: text("donation_id")
      .primaryKey()
      .references(() => donations.id, { onDelete: "cascade" }),
    npo_id: integer("npo_id").references(() => npos.id),
    fund_id: text("fund_id").references(() => funds.id),
    name: text("name").notNull(),
    type: text("type").notNull(),
    tip_allowed: boolean("tip_allowed"),
    members: integer("members").array(),
  },
  (t) => [
    check("type_check", sql`${t.type} IN ('npo','fund')`),
    check("recipient_xor", sql`num_nonnulls(${t.npo_id}, ${t.fund_id}) = 1`),
    index("donation_recipients_fund_id_idx").on(t.fund_id),
  ]
);

export const donation_donors = pgTable(
  "donation_donors",
  {
    donation_id: text("donation_id")
      .primaryKey()
      .references(() => donations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    title: text("title"),
    company_name: text("company_name"),
    addr: jsonb("addr").$type<IAddr | null>(),
    wallet_addr: text("wallet_addr"),
    public_msg: text("public_msg"),
    private_msg: text("private_msg"),
    is_public: boolean("is_public"),
  },
  (t) => [index("donation_donors_email_idx").on(t.email)]
);

export const donation_settlements = pgTable(
  "donation_settlements",
  {
    donation_id: text("donation_id")
      .primaryKey()
      .references(() => donations.id, { onDelete: "cascade" }),
    sttl_id: text("sttl_id").notNull(),
    date: timestamptz("date").notNull(),
    currency: text("currency").notNull(),
    net: numeric_as_number("net", { precision: 38, scale: 18 }).notNull(),
    fee: numeric_as_number("fee", { precision: 38, scale: 18 }).notNull(),
  },
  // the provider's charge id. what each handler does with it differs, and the
  // difference matters:
  //
  // - stripe reads it inside the settle transaction and *recovers*: a
  //   redelivery recomputes the first delivery's queue messages instead of
  //   minting a second donation, so msgs lost between the commit and the
  //   enqueue still go out.
  // - paypal reads it too, but only to *bail* — it answers 200 and queues
  //   nothing, so a first delivery that committed and then failed to enqueue
  //   stays that way. it is a duplicate guard, not a recovery.
  // - chariot and nowpayments do not read it at all. both are one-time-only,
  //   so their redelivery re-updates the same donation_id, and the duplicate
  //   dist and receipt it queues are absorbed downstream.
  //
  // non-unique. the duplicate sweep this was waiting on has run and came back
  // clean — 503 distinct sttl_ids over 503 rows, no pair sharing one. so
  // UNIQUE is a viable follow-up rather than an open question: it would turn
  // the guard from a convention into a constraint and cover the two handlers
  // that don't check. deliberately not added here.
  (t) => [index("donation_settlements_sttl_id_idx").on(t.sttl_id)]
);

export const donation_tributes = pgTable("donation_tributes", {
  donation_id: text("donation_id")
    .primaryKey()
    .references(() => donations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  notif_email: text("notif_email"),
  notif_fullname: text("notif_fullname"),
  notif_msg: text("notif_msg"),
});
