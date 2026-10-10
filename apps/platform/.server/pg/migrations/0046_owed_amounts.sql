CREATE TABLE "owed_amounts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"donation_id" text NOT NULL,
	"npo_id" integer,
	"referrer_user" text,
	"referrer_npo" text,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"recorded_at" timestamptz NOT NULL,
	"received_usd" numeric(38, 18) NOT NULL,
	"fee_processing_usd" numeric(38, 18) DEFAULT 0 NOT NULL,
	"fee_dispute_usd" numeric(38, 18) DEFAULT 0 NOT NULL,
	"credited_back_usd" numeric(38, 18) DEFAULT 0 NOT NULL,
	"credited_back_at" timestamptz,
	"recovered_usd" numeric(38, 18) DEFAULT 0 NOT NULL,
	"recovered_at" timestamptz,
	"written_off_usd" numeric(38, 18) DEFAULT 0 NOT NULL,
	"written_off_at" timestamptz,
	"write_off_reason" text,
	"written_off_by" text,
	"outstanding_usd" numeric(38, 18) GENERATED ALWAYS AS (received_usd + fee_processing_usd + fee_dispute_usd - credited_back_usd - recovered_usd - written_off_usd) STORED,
	CONSTRAINT "owed_amounts_donation_party_uniq" UNIQUE NULLS NOT DISTINCT("donation_id","npo_id","referrer_user","referrer_npo"),
	CONSTRAINT "owed_amounts_party_xor" CHECK (num_nonnulls("owed_amounts"."npo_id", "owed_amounts"."referrer_user", "owed_amounts"."referrer_npo") = 1),
	CONSTRAINT "owed_amounts_source_check" CHECK ("owed_amounts"."source" IN ('refund','dispute')),
	CONSTRAINT "owed_amounts_source_ref_check" CHECK ("owed_amounts"."source_ref" <> ''),
	CONSTRAINT "owed_amounts_figures_check" CHECK ("owed_amounts"."received_usd" >= 0 AND "owed_amounts"."fee_processing_usd" >= 0 AND "owed_amounts"."fee_dispute_usd" >= 0
        AND "owed_amounts"."credited_back_usd" >= 0 AND "owed_amounts"."recovered_usd" >= 0 AND "owed_amounts"."written_off_usd" >= 0),
	CONSTRAINT "owed_amounts_settled_within_owed_check" CHECK (GREATEST("owed_amounts"."credited_back_usd", "owed_amounts"."recovered_usd", "owed_amounts"."written_off_usd")
        <= "owed_amounts"."received_usd" + "owed_amounts"."fee_processing_usd" + "owed_amounts"."fee_dispute_usd"),
	CONSTRAINT "owed_amounts_credit_dated_check" CHECK ("owed_amounts"."credited_back_usd" = 0 OR "owed_amounts"."credited_back_at" IS NOT NULL),
	CONSTRAINT "owed_amounts_recovery_dated_check" CHECK ("owed_amounts"."recovered_usd" = 0 OR "owed_amounts"."recovered_at" IS NOT NULL),
	CONSTRAINT "owed_amounts_write_off_check" CHECK (num_nonnulls("owed_amounts"."written_off_at", "owed_amounts"."write_off_reason", "owed_amounts"."written_off_by") IN (0, 3)
        AND ("owed_amounts"."written_off_usd" = 0 OR "owed_amounts"."written_off_at" IS NOT NULL)
        AND btrim("owed_amounts"."write_off_reason") <> '')
);
--> statement-breakpoint
ALTER TABLE "owed_amounts" ADD CONSTRAINT "owed_amounts_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owed_amounts" ADD CONSTRAINT "owed_amounts_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owed_amounts" ADD CONSTRAINT "owed_amounts_referrer_user_user_referral_code_fk" FOREIGN KEY ("referrer_user") REFERENCES "public"."user"("referral_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owed_amounts" ADD CONSTRAINT "owed_amounts_referrer_npo_npos_referral_id_fk" FOREIGN KEY ("referrer_npo") REFERENCES "public"."npos"("referral_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owed_amounts" ADD CONSTRAINT "owed_amounts_written_off_by_user_id_fk" FOREIGN KEY ("written_off_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "owed_amounts_npo_outstanding_idx" ON "owed_amounts" USING btree ("npo_id") WHERE "owed_amounts"."npo_id" IS NOT NULL AND "owed_amounts"."outstanding_usd" <> 0;