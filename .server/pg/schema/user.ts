import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { timestamptz } from "./columns";
import { funds } from "./fund";
import { npos } from "./npo";

export const user_bookmarks = pgTable(
  "user_bookmarks",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    npo_id: integer("npo_id")
      .notNull()
      .references(() => npos.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.user_id, t.npo_id] }),
    index("user_bookmarks_npo_id_idx").on(t.npo_id),
  ]
);

export const user_npo_memberships = pgTable(
  "user_npo_memberships",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    npo_id: integer("npo_id")
      .notNull()
      .references(() => npos.id, { onDelete: "cascade" }),
    alert_banking: boolean("alert_banking").notNull().default(false),
    alert_donation: boolean("alert_donation").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.user_id, t.npo_id] }),
    index("user_npo_memberships_npo_id_idx").on(t.npo_id),
  ]
);

export const user_fund_memberships = pgTable(
  "user_fund_memberships",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fund_id: text("fund_id")
      .notNull()
      .references(() => funds.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.user_id, t.fund_id] }),
    index("user_fund_memberships_fund_id_idx").on(t.fund_id),
  ]
);

export const user_invites = pgTable(
  "user_invites",
  {
    invitee: text("invitee").primaryKey(),
    invitee_first: text("invitee_first").notNull(),
    invitor_id: text("invitor_id")
      .notNull()
      .references(() => user.id),
    npo_name: text("npo_name").notNull(),
    // nullable for phase-1 rollout; backfilled in phase 2, NOT NULL in phase 4
    npo_id: integer("npo_id").references(() => npos.id, {
      onDelete: "cascade",
    }),
    expire_at: timestamptz("expire_at").notNull(),
  },
  (t) => [index("user_invites_npo_id_idx").on(t.npo_id)]
);
