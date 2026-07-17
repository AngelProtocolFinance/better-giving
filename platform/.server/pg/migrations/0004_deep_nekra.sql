ALTER TABLE "npos" ADD COLUMN "referrer_user" text;--> statement-breakpoint
ALTER TABLE "npos" ADD COLUMN "referrer_npo" text;--> statement-breakpoint
ALTER TABLE "referrer_commissions" ADD COLUMN "referrer_user" text;--> statement-breakpoint
ALTER TABLE "referrer_commissions" ADD COLUMN "referrer_npo" text;--> statement-breakpoint
ALTER TABLE "referrer_payouts" ADD COLUMN "referrer_user" text;--> statement-breakpoint
ALTER TABLE "referrer_payouts" ADD COLUMN "referrer_npo" text;