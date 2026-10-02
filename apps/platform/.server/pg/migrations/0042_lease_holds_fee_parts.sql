SET LOCAL lock_timeout = '2s';--> statement-breakpoint
CREATE INDEX "subscriptions_from_id_lower_status_idx" ON "subscriptions" USING btree (lower("from_id"),"status","created_at");--> statement-breakpoint
ALTER TABLE "dists" ADD COLUMN "notice_claimed_at" timestamptz;--> statement-breakpoint
ALTER TABLE "dists" ADD COLUMN "notice_sent_at" timestamptz;--> statement-breakpoint
ALTER TABLE "donation_settlements" ADD COLUMN "fee_parts" jsonb;--> statement-breakpoint
ALTER TABLE "donation_settlements" ADD CONSTRAINT "fee_parts_object_check" CHECK (jsonb_typeof("donation_settlements"."fee_parts") = 'object') NOT VALID;--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "held_at" timestamptz;--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "hold_asset" text;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "hold_pair_check" CHECK (num_nonnulls("donations"."held_at", "donations"."hold_asset") IN (0, 2)) NOT VALID;--> statement-breakpoint
CREATE OR REPLACE VIEW "public"."v_referrer_payout_ltd" AS (SELECT COALESCE(referrer_user, referrer_npo) as referrer, SUM(amount) as total FROM referrer_payouts WHERE error IS NULL GROUP BY COALESCE(referrer_user, referrer_npo));
