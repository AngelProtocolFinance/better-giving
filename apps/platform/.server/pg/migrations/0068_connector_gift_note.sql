SET LOCAL lock_timeout = '2s';--> statement-breakpoint
CREATE INDEX "donation_recipients_npo_id_idx" ON "donation_recipients" USING btree ("npo_id");--> statement-breakpoint
CREATE INDEX "donations_created_at_id_idx" ON "donations" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "subscriptions_to_fund_id_idx" ON "subscriptions" USING btree ("to_fund_id");