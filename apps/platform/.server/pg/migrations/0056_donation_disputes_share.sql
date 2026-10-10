SET LOCAL lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "donation_disputes" ADD COLUMN "share" numeric(38, 18);--> statement-breakpoint
ALTER TABLE "donation_disputes" ADD COLUMN "fee_usd" numeric(38, 18);--> statement-breakpoint
-- not valid: the columns were just added, so every row is null and a validating scan proves nothing
ALTER TABLE "donation_disputes" ADD CONSTRAINT "donation_disputes_share_check" CHECK (num_nonnulls("donation_disputes"."share", "donation_disputes"."fee_usd") IN (0, 2)
        AND "donation_disputes"."share" > 0 AND "donation_disputes"."share" <= 1 AND "donation_disputes"."fee_usd" >= 0) NOT VALID;
