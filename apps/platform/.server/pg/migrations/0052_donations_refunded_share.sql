SET LOCAL lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "refunded_share" numeric(38, 18);--> statement-breakpoint
-- not valid: the column was just added, so every row is null and a validating scan of donations proves nothing
ALTER TABLE "donations" ADD CONSTRAINT "donations_refunded_share_check" CHECK ("donations"."refunded_share" > 0 AND "donations"."refunded_share" < 1) NOT VALID;
