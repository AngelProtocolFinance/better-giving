ALTER TABLE "funds" ALTER COLUMN "description_pt" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "npos" ALTER COLUMN "overview_pt" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "milestones" ALTER COLUMN "description_pt" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ALTER COLUMN "description_pt" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "funds" DROP COLUMN "description_rich";--> statement-breakpoint
ALTER TABLE "npos" DROP COLUMN "overview_rich";--> statement-breakpoint
ALTER TABLE "milestones" DROP COLUMN "description_rich";--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "description_rich";