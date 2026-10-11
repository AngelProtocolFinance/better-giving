SET LOCAL lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "donation_takes" ADD COLUMN "refunded_at" timestamptz;--> statement-breakpoint
ALTER TABLE "donation_takes" ADD CONSTRAINT "donation_takes_refunded_at_check" CHECK ("donation_takes"."kind" = 'refund' OR "donation_takes"."refunded_at" IS NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "donation_takes" VALIDATE CONSTRAINT "donation_takes_refunded_at_check";
