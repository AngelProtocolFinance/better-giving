SET LOCAL lock_timeout = '2s';--> statement-breakpoint
CREATE TABLE "donation_takes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"donation_id" text NOT NULL,
	"ref" text NOT NULL,
	"kind" text NOT NULL,
	"share" numeric(38, 18) NOT NULL,
	"fee_usd" numeric(38, 18) DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"dispute_id" text,
	"chargeback_ref" text,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "donation_takes_ref_uniq" UNIQUE("donation_id","ref"),
	CONSTRAINT "donation_takes_chargeback_ref_uniq" UNIQUE("donation_id","chargeback_ref"),
	CONSTRAINT "donation_takes_kind_check" CHECK ("donation_takes"."kind" IN ('refund','dispute')),
	CONSTRAINT "donation_takes_status_check" CHECK ("donation_takes"."status" IN ('active','undone')),
	CONSTRAINT "donation_takes_share_check" CHECK ("donation_takes"."share" > 0 AND "donation_takes"."share" <= 1 AND "donation_takes"."fee_usd" >= 0),
	CONSTRAINT "donation_takes_refund_check" CHECK ("donation_takes"."kind" = 'dispute' OR ("donation_takes"."dispute_id" IS NULL AND "donation_takes"."chargeback_ref" IS NULL AND "donation_takes"."fee_usd" = 0)),
	CONSTRAINT "donation_takes_ref_check" CHECK ("donation_takes"."ref" <> '')
);
--> statement-breakpoint
ALTER TABLE "donation_takes" ADD CONSTRAINT "donation_takes_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE no action ON UPDATE no action;