SET LOCAL lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "dists" ADD COLUMN "metric_counted_at" timestamptz;--> statement-breakpoint
ALTER TABLE "dists" ADD COLUMN "hooks_sent_at" timestamptz;--> statement-breakpoint
-- a notice stamped sent under the single-stamp model already counted its metric and fired its hooks
UPDATE "dists" SET "metric_counted_at" = "notice_sent_at", "hooks_sent_at" = "notice_sent_at" WHERE "notice_sent_at" IS NOT NULL;
