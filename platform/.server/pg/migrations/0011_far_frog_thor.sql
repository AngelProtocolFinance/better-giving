ALTER TABLE "donations" DROP CONSTRAINT "status_check";--> statement-breakpoint
ALTER TABLE "dists" DROP CONSTRAINT "dists_status_check";--> statement-breakpoint
ALTER TABLE "rev_logs" DROP CONSTRAINT "rev_logs_status_check";--> statement-breakpoint
ALTER TABLE "payouts" DROP CONSTRAINT "type_check";--> statement-breakpoint
ALTER TABLE "referrer_commissions" DROP CONSTRAINT "status_check";--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "status_check" CHECK ("donations"."status" IN ('created','intent','expired','confirmed','settled','failed','refunded','refunded_loss','cancelled'));--> statement-breakpoint
ALTER TABLE "dists" ADD CONSTRAINT "dists_status_check" CHECK ("dists"."status" IN ('settled','refunded','refunded_loss'));--> statement-breakpoint
ALTER TABLE "rev_logs" ADD CONSTRAINT "rev_logs_status_check" CHECK ("rev_logs"."status" IN ('final','refunded','refunded_loss'));--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "type_check" CHECK ("payouts"."type" IN ('pending','settled','error','refunded','refunded_loss','cancelled'));--> statement-breakpoint
ALTER TABLE "referrer_commissions" ADD CONSTRAINT "status_check" CHECK ("referrer_commissions"."status" IN ('pending','paid','refunded','refunded_loss'));