DROP VIEW "public"."v_referrer_commissions_ltd";--> statement-breakpoint
DROP VIEW "public"."v_referrer_payout_ltd";--> statement-breakpoint
ALTER TABLE "referrer_payouts" DROP CONSTRAINT "referrer_payouts_id_unique";--> statement-breakpoint
DROP INDEX "npos_referrer_idx";--> statement-breakpoint
DROP INDEX "npos_referral_id_idx";--> statement-breakpoint
DROP INDEX "referrer_commissions_referrer_npo_id_idx";--> statement-breakpoint
ALTER TABLE "referrer_commissions" DROP CONSTRAINT "referrer_commissions_referrer_date_pk";--> statement-breakpoint
ALTER TABLE "referrer_payouts" DROP CONSTRAINT "referrer_payouts_referrer_date_pk";--> statement-breakpoint
ALTER TABLE "referrer_commissions" ADD PRIMARY KEY ("donation_id");--> statement-breakpoint
ALTER TABLE "referrer_payouts" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "referrer_payouts" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "npos" DROP COLUMN "referrer";--> statement-breakpoint
ALTER TABLE "referrer_commissions" DROP COLUMN "referrer";--> statement-breakpoint
ALTER TABLE "referrer_payouts" DROP COLUMN "referrer";--> statement-breakpoint
ALTER TABLE "npos" ADD CONSTRAINT "npos_referral_id_unique" UNIQUE("referral_id");--> statement-breakpoint
ALTER TABLE "npos" ADD CONSTRAINT "npos_referrer_user_user_referral_code_fk" FOREIGN KEY ("referrer_user") REFERENCES "public"."user"("referral_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npos" ADD CONSTRAINT "npos_referrer_npo_npos_referral_id_fk" FOREIGN KEY ("referrer_npo") REFERENCES "public"."npos"("referral_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrer_commissions" ADD CONSTRAINT "referrer_commissions_referrer_user_user_referral_code_fk" FOREIGN KEY ("referrer_user") REFERENCES "public"."user"("referral_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrer_commissions" ADD CONSTRAINT "referrer_commissions_referrer_npo_npos_referral_id_fk" FOREIGN KEY ("referrer_npo") REFERENCES "public"."npos"("referral_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrer_payouts" ADD CONSTRAINT "referrer_payouts_referrer_user_user_referral_code_fk" FOREIGN KEY ("referrer_user") REFERENCES "public"."user"("referral_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrer_payouts" ADD CONSTRAINT "referrer_payouts_referrer_npo_npos_referral_id_fk" FOREIGN KEY ("referrer_npo") REFERENCES "public"."npos"("referral_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npos" ADD CONSTRAINT "referrer_xor" CHECK (num_nonnulls("npos"."referrer_user", "npos"."referrer_npo") <= 1);--> statement-breakpoint
ALTER TABLE "referrer_commissions" ADD CONSTRAINT "referrer_xor" CHECK (num_nonnulls("referrer_commissions"."referrer_user", "referrer_commissions"."referrer_npo") = 1);--> statement-breakpoint
ALTER TABLE "referrer_payouts" ADD CONSTRAINT "referrer_xor" CHECK (num_nonnulls("referrer_payouts"."referrer_user", "referrer_payouts"."referrer_npo") = 1);--> statement-breakpoint
CREATE INDEX "npos_referrer_user_idx" ON "npos" USING btree ("referrer_user") WHERE "npos"."referrer_user" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "npos_referrer_npo_idx" ON "npos" USING btree ("referrer_npo") WHERE "npos"."referrer_npo" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "referrer_commissions_referrer_user_npo_id_idx" ON "referrer_commissions" USING btree ("referrer_user","npo_id");--> statement-breakpoint
CREATE INDEX "referrer_commissions_referrer_npo_npo_id_idx" ON "referrer_commissions" USING btree ("referrer_npo","npo_id");--> statement-breakpoint
CREATE VIEW "public"."v_referrer_commissions_ltd" AS (SELECT COALESCE(referrer_user, referrer_npo) as referrer, npo_id, SUM(amount) as total FROM referrer_commissions WHERE status = 'paid' GROUP BY COALESCE(referrer_user, referrer_npo), npo_id);--> statement-breakpoint
CREATE VIEW "public"."v_referrer_payout_ltd" AS (SELECT COALESCE(referrer_user, referrer_npo) as referrer, SUM(amount) as total FROM referrer_payouts GROUP BY COALESCE(referrer_user, referrer_npo));
