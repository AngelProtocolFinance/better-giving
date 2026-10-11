SET LOCAL lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "donation_disputes" ADD COLUMN "cumulative_share" numeric(38, 18);--> statement-breakpoint
-- not valid: the column was just added, so every row passes and a validating scan proves nothing
ALTER TABLE "donation_disputes" ADD CONSTRAINT "donation_disputes_cumulative_share_check" CHECK ("donation_disputes"."cumulative_share" IS NULL OR ("donation_disputes"."share" IS NOT NULL
        AND "donation_disputes"."cumulative_share" >= "donation_disputes"."share" AND "donation_disputes"."cumulative_share" <= 1)) NOT VALID;
