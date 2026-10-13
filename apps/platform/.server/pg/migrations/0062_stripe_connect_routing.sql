SET LOCAL lock_timeout = '2s';--> statement-breakpoint
-- npos before dists: settlement locks its npo, then writes the dist, so the reverse order can deadlock against it
ALTER TABLE "npos" ADD COLUMN "stripe_deauthorized_at" timestamptz;--> statement-breakpoint
ALTER TABLE "dists" ADD COLUMN "stripe_routed_to" text;--> statement-breakpoint
ALTER TABLE "dists" ADD COLUMN "stripe_transfer_id" text;--> statement-breakpoint
-- not valid: both columns were added null above, so a validating scan proves nothing; every write from here on is still checked
ALTER TABLE "dists" ADD CONSTRAINT "dists_transfer_routed_check" CHECK ("dists"."stripe_transfer_id" IS NULL OR "dists"."stripe_routed_to" IS NOT NULL) NOT VALID;--> statement-breakpoint
-- scans every dist under the access exclusive the column add holds until commit; the column was just added, so every row is null and the index comes out empty
CREATE UNIQUE INDEX "dists_stripe_transfer_id_uniq" ON "dists" USING btree ("stripe_transfer_id") WHERE "dists"."stripe_transfer_id" IS NOT NULL;