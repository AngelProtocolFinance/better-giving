DROP INDEX "npos_search_trgm_idx";--> statement-breakpoint
ALTER TABLE "npos" ADD COLUMN "overview_v2" text;--> statement-breakpoint
ALTER TABLE "npos" ADD COLUMN "overview_rich" text;--> statement-breakpoint
CREATE INDEX "npos_search_trgm_idx" ON "npos" USING gin ((COALESCE("name",'') || ' ' || COALESCE("tagline",'') || ' ' || COALESCE("overview_v2",'') || ' ' || COALESCE("registration_number",'')) gin_trgm_ops);