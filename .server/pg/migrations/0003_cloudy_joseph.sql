ALTER TABLE "funds" ALTER COLUMN "description_rich" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "milestones" ALTER COLUMN "description_rich" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ALTER COLUMN "description_rich" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "npos" DROP COLUMN "overview";--> statement-breakpoint
ALTER TABLE "funds" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "milestones" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "description";