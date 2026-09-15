SET LOCAL lock_timeout = '2s';--> statement-breakpoint
DROP INDEX "donation_settlements_sttl_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "donation_settlements_sttl_id_idx" ON "donation_settlements" USING btree ("sttl_id");