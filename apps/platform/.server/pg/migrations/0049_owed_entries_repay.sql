SET LOCAL lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "owed_entries" DROP CONSTRAINT "owed_entries_kind_check";--> statement-breakpoint
ALTER TABLE "owed_entries" ADD CONSTRAINT "owed_entries_kind_check" CHECK ("owed_entries"."kind" IN ('credit','recover','repay','write_off')) NOT VALID;--> statement-breakpoint
ALTER TABLE "owed_entries" VALIDATE CONSTRAINT "owed_entries_kind_check";
