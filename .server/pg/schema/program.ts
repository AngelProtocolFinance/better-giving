import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { numeric_as_number, timestamptz } from "./columns";
import { npos } from "./npo";

export const programs = pgTable(
  "programs",
  {
    id: text("id").primaryKey(),
    npo_id: integer("npo_id")
      .notNull()
      .references(() => npos.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description_v2: text("description_v2"),
    description_pt: text("description_pt").notNull(),
    banner: text("banner"),
    target_raise: numeric_as_number("target_raise", {
      precision: 38,
      scale: 18,
    }),
    total_donations: numeric_as_number("total_donations", {
      precision: 38,
      scale: 18,
    }).default(0),
    created_at: timestamptz("created_at"),
  },
  (t) => [index("programs_npo_id_idx").on(t.npo_id, t.created_at)]
);

export const milestones = pgTable(
  "milestones",
  {
    id: text("id").primaryKey(),
    program_id: text("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    date: timestamptz("date"),
    title: text("title").notNull(),
    description_v2: text("description_v2"),
    description_pt: text("description_pt").notNull(),
    media: text("media"),
  },
  (t) => [index("milestones_program_id_idx").on(t.program_id, t.date)]
);
