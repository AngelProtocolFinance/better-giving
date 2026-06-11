import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";
import type { DonateMethodId, IIncrement } from "@/schemas";
import { user } from "./auth";
import { numeric_as_number, timestamptz, timestamptz_now } from "./columns";
import { npos } from "./npo";

export const funds = pgTable(
  "funds",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").unique(),
    description_v2: text("description_v2"),
    description_rich: text("description_rich").notNull(),
    banner: text("banner").notNull(),
    logo: text("logo").notNull(),
    published: boolean("featured").notNull().default(false),
    expiration: timestamptz("expiration"),
    target_number: numeric_as_number("target_number", {
      precision: 38,
      scale: 18,
    }),
    target_smart: boolean("target_smart"),
    videos: text("videos").array().notNull().default(sql`'{}'::text[]`),
    increments: jsonb("increments").$type<IIncrement[] | null>(),
    npo_owner: integer("npo_owner").references(() => npos.id),
    creator_id: text("creator_id")
      .notNull()
      .references(() => user.id),
    spam_score: numeric_as_number("spam_score", { precision: 5, scale: 2 }),
    hide_bg_tip: boolean("hide_bg_tip").notNull().default(false),
    fund_donate_methods: text("fund_donate_methods")
      .array()
      .$type<DonateMethodId[]>(),
    active: boolean("active").notNull().default(false),
    created_at: timestamptz_now("created_at"),
    updated_at: timestamptz_now("updated_at"),
  },
  (t) => [
    check(
      "target_xor",
      sql`num_nonnulls(${t.target_number}, ${t.target_smart}) <= 1`
    ),
    index("funds_npo_owner_idx").on(t.npo_owner),
    index("funds_creator_id_idx").on(t.creator_id),
    index("funds_created_at_idx").on(t.created_at),
    // pg_trgm fuzzy search index on name + description_v2 (plain text)
    index("funds_search_trgm_idx").using(
      "gin",
      sql`(COALESCE(${t.name},'') || ' ' || COALESCE(${t.description_v2},'')) gin_trgm_ops`
    ),
  ]
);

export const fund_members = pgTable(
  "fund_members",
  {
    fund_id: text("fund_id")
      .notNull()
      .references(() => funds.id, { onDelete: "cascade" }),
    npo_id: integer("npo_id")
      .notNull()
      .references(() => npos.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.fund_id, t.npo_id] }),
    index("fund_members_npo_id_idx").on(t.npo_id),
  ]
);
