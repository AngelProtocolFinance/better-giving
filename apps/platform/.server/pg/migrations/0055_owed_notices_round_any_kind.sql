SET LOCAL lock_timeout = '2s';--> statement-breakpoint
-- a credited or waived notice now takes the round it settles. relaxing only: every row the old check admits, this one does
ALTER TABLE "owed_notices" DROP CONSTRAINT "owed_notices_round_check";--> statement-breakpoint
ALTER TABLE "owed_notices" ADD CONSTRAINT "owed_notices_round_check" CHECK ("owed_notices"."round" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "owed_notices" VALIDATE CONSTRAINT "owed_notices_round_check";
