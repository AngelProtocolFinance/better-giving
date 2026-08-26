ALTER TABLE "banking_apps" ADD COLUMN "updated_at" timestamptz DEFAULT now() NOT NULL;--> statement-breakpoint
-- not generated: DEFAULT now() would stamp every pre-existing row with the
-- migration time, reading as "everything changed today". submission time is the
-- only truth we have for rows predating the column.
UPDATE "banking_apps" SET "updated_at" = "date_created";--> statement-breakpoint
CREATE INDEX "banking_apps_status_updated_idx" ON "banking_apps" USING btree ("status","updated_at");
