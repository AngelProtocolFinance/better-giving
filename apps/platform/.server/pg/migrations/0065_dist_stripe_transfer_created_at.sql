SET LOCAL lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "dists" ADD COLUMN "stripe_transfer_created_at" timestamptz;--> statement-breakpoint
-- nullable: the release already writing stripe_transfer_id sets only that column, and it still serves while this runs. a transfer stored before this column has no stripe creation time; the payouts list ordered it by the donation's date_created, so that is the time it keeps
UPDATE "dists" SET "stripe_transfer_created_at" = "date_created" WHERE "stripe_transfer_id" IS NOT NULL AND "stripe_transfer_created_at" IS NULL;
