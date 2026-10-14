SET LOCAL lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "dists" ADD COLUMN "settled_net" numeric(38, 18);--> statement-breakpoint
-- a cut row written before this column rebuilt its settled net from the booked one; those rows exist only where 0062 ran ahead of this release
UPDATE "dists" SET "settled_net" = CASE WHEN "refunds_cut_share" >= 1 THEN "net" ELSE round("net" / (1 - "refunds_cut_share"), 2) END WHERE "refunds_cut_share" IS NOT NULL AND "settled_net" IS NULL;--> statement-breakpoint
-- not valid, as 0062's checks: the backfill above already gave every cut row its settled net, and every write from here on is checked
ALTER TABLE "dists" ADD CONSTRAINT "dists_settled_net_cut_check" CHECK ("dists"."refunds_cut_share" IS NULL OR "dists"."settled_net" IS NOT NULL) NOT VALID;
