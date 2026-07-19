ALTER TABLE "funds" ALTER COLUMN "description_rich" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "milestones" ALTER COLUMN "description_rich" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ALTER COLUMN "description_rich" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "funds" ADD COLUMN "description_pt" text;--> statement-breakpoint
ALTER TABLE "npos" ADD COLUMN "overview_pt" text;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "description_pt" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "description_pt" text;