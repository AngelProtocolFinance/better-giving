SET LOCAL lock_timeout = '2s';--> statement-breakpoint
CREATE INDEX "donations_program_id_idx" ON "donations" USING btree ("program_id") WHERE "donations"."program_id" IS NOT NULL;
