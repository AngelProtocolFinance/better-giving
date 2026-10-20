SET LOCAL lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "note" text;--> statement-breakpoint
CREATE INDEX "donation_recipients_npo_id_idx" ON "donation_recipients" USING btree ("npo_id");--> statement-breakpoint
CREATE INDEX "donations_created_at_id_idx" ON "donations" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "donations_offline_created_idx" ON "donations" USING btree ("created_at","id") WHERE "donations"."source" = 'bg-connector-offline';--> statement-breakpoint
CREATE INDEX "forms_recipient_npo_id_idx" ON "forms" USING btree ("recipient_npo_id");--> statement-breakpoint
CREATE INDEX "forms_recipient_fund_id_idx" ON "forms" USING btree ("recipient_fund_id");--> statement-breakpoint
CREATE INDEX "subscriptions_to_fund_id_idx" ON "subscriptions" USING btree ("to_fund_id");