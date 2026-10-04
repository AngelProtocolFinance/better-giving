SET LOCAL lock_timeout = '2s';--> statement-breakpoint
CREATE TABLE "owed_entries" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"owed_id" text NOT NULL,
	"kind" text NOT NULL,
	"usd" numeric(38, 18) NOT NULL,
	"reason" text NOT NULL,
	"ref" text NOT NULL,
	"at" timestamptz NOT NULL,
	"actor" text,
	CONSTRAINT "owed_entries_owed_kind_ref_uniq" UNIQUE("owed_id","kind","ref"),
	CONSTRAINT "owed_entries_kind_check" CHECK ("owed_entries"."kind" IN ('credit','recover','write_off')),
	CONSTRAINT "owed_entries_usd_check" CHECK ("owed_entries"."usd" > 0),
	CONSTRAINT "owed_entries_reason_check" CHECK (btrim("owed_entries"."reason") <> ''),
	CONSTRAINT "owed_entries_ref_check" CHECK ("owed_entries"."ref" <> '')
);
--> statement-breakpoint
ALTER TABLE "owed_amounts" DROP CONSTRAINT "owed_amounts_settled_within_owed_check";--> statement-breakpoint
ALTER TABLE "owed_entries" ADD CONSTRAINT "owed_entries_owed_id_owed_amounts_id_fk" FOREIGN KEY ("owed_id") REFERENCES "public"."owed_amounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owed_entries" ADD CONSTRAINT "owed_entries_actor_user_id_fk" FOREIGN KEY ("actor") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owed_amounts" ADD CONSTRAINT "owed_amounts_settled_within_owed_check" CHECK ("owed_amounts"."credited_back_usd" + "owed_amounts"."written_off_usd"
          <= "owed_amounts"."received_usd" + "owed_amounts"."fee_processing_usd" + "owed_amounts"."fee_dispute_usd"
        AND "owed_amounts"."recovered_usd" <= "owed_amounts"."received_usd" + "owed_amounts"."fee_processing_usd" + "owed_amounts"."fee_dispute_usd");