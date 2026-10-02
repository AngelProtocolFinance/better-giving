SET LOCAL lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_requested_at" timestamptz;