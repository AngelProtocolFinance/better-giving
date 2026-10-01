SET LOCAL lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "referrer_commissions" DROP CONSTRAINT "status_check";--> statement-breakpoint
ALTER TABLE "referrer_commissions" ADD COLUMN "ref" text;--> statement-breakpoint
ALTER TABLE "referrer_commissions" ADD CONSTRAINT "status_check" CHECK ("referrer_commissions"."status" IN ('pending','processing','paid','refunded','refunded_loss')) NOT VALID;--> statement-breakpoint
ALTER TABLE "referrer_commissions" VALIDATE CONSTRAINT "status_check";
