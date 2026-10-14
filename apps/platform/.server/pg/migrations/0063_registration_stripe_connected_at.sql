SET LOCAL lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "o_stripe_connected_at" timestamptz;