SET LOCAL lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "npos" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "npos" ADD COLUMN "stripe_charges_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "npos" ADD COLUMN "stripe_payouts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "npos" ADD COLUMN "stripe_details_submitted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "npos" ADD COLUMN "stripe_requirements_due" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "npos" ADD COLUMN "stripe_synced_at" timestamptz;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "o_stripe_account_id" text;--> statement-breakpoint
-- builds its index under access exclusive on npos; the column was just added, so every row is null and the build is a scan of a nonprofit-sized table
ALTER TABLE "npos" ADD CONSTRAINT "npos_stripe_account_id_unique" UNIQUE("stripe_account_id");