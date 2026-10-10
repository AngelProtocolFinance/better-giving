SET LOCAL lock_timeout = '2s';--> statement-breakpoint
-- a constant default: catalog-only, no rewrite. every existing notice is round 0
ALTER TABLE "owed_notices" ADD COLUMN "round" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- the old key admits one recorded notice per row. a deployment still on its ON CONFLICT target fails record_owed until the new one serves; only preview/staging ever ran it
ALTER TABLE "owed_notices" DROP CONSTRAINT "owed_notices_owed_kind_uniq";--> statement-breakpoint
ALTER TABLE "owed_notices" ADD CONSTRAINT "owed_notices_owed_kind_round_uniq" UNIQUE("owed_id","kind","round");--> statement-breakpoint
ALTER TABLE "owed_notices" ADD CONSTRAINT "owed_notices_round_check" CHECK ("owed_notices"."round" >= 0 AND ("owed_notices"."kind" = 'recorded' OR "owed_notices"."round" = 0)) NOT VALID;--> statement-breakpoint
ALTER TABLE "owed_notices" VALIDATE CONSTRAINT "owed_notices_round_check";
