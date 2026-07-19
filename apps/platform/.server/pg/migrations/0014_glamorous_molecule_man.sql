ALTER TABLE "donations" ADD COLUMN "subscription_id" text;--> statement-breakpoint
CREATE INDEX "donations_subscription_id_idx" ON "donations" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_to_npo_id_status_idx" ON "subscriptions" USING btree ("to_npo_id","status","created_at");