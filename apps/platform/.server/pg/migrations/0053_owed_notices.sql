CREATE TABLE "owed_notices" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"owed_id" text NOT NULL,
	"kind" text NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"created_at" timestamptz NOT NULL,
	"claimed_at" timestamptz,
	"sent_at" timestamptz,
	CONSTRAINT "owed_notices_owed_kind_round_uniq" UNIQUE("owed_id","kind","round"),
	CONSTRAINT "owed_notices_round_check" CHECK ("owed_notices"."round" >= 0 AND ("owed_notices"."kind" = 'recorded' OR "owed_notices"."round" = 0)),
	CONSTRAINT "owed_notices_kind_check" CHECK ("owed_notices"."kind" IN ('recorded','credited','waived'))
);
--> statement-breakpoint
ALTER TABLE "owed_notices" ADD CONSTRAINT "owed_notices_owed_id_owed_amounts_id_fk" FOREIGN KEY ("owed_id") REFERENCES "public"."owed_amounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "owed_notices_unsent_idx" ON "owed_notices" USING btree ("created_at") WHERE "owed_notices"."sent_at" IS NULL;