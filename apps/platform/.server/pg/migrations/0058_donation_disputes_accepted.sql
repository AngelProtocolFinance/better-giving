SET LOCAL lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "donation_disputes" ADD COLUMN "loss_recorded_at" timestamptz;--> statement-breakpoint
ALTER TABLE "donation_disputes" DROP CONSTRAINT "donation_disputes_status_check";--> statement-breakpoint
ALTER TABLE "donation_disputes" ADD CONSTRAINT "donation_disputes_status_check" CHECK ("donation_disputes"."status" IN ('open','lost','won','inquiry_closed','accepted')) NOT VALID;--> statement-breakpoint
ALTER TABLE "donation_disputes" VALIDATE CONSTRAINT "donation_disputes_status_check";
