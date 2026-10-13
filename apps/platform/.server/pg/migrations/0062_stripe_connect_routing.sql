SET LOCAL lock_timeout = '2s';--> statement-breakpoint
-- npos before dists: settlement locks its npo, then writes the dist, so the reverse order can deadlock against it
ALTER TABLE "npos" ADD COLUMN "stripe_deauthorized_at" timestamptz;--> statement-breakpoint
ALTER TABLE "dists" ADD COLUMN "stripe_transfer_id" text;--> statement-breakpoint
-- scans every dist under the access exclusive the column add holds until commit; the column was just added, so every row is null and the index comes out empty
CREATE UNIQUE INDEX "dists_stripe_transfer_id_uniq" ON "dists" USING btree ("stripe_transfer_id") WHERE "dists"."stripe_transfer_id" IS NOT NULL;