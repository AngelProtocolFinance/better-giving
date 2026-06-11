DROP INDEX "funds_search_trgm_idx";--> statement-breakpoint
ALTER TABLE "funds" ADD COLUMN "description_v2" text;--> statement-breakpoint
ALTER TABLE "funds" ADD COLUMN "description_rich" text;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "description_v2" text;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "description_rich" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "description_v2" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "description_rich" text;--> statement-breakpoint
CREATE INDEX "funds_search_trgm_idx" ON "funds" USING gin ((COALESCE("name",'') || ' ' || COALESCE("description_v2",'')) gin_trgm_ops);