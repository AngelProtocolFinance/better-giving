CREATE TABLE "donation_match_events" (
	"id" text PRIMARY KEY NOT NULL,
	"donation_id" text NOT NULL,
	"pack_sent_at" timestamptz,
	"chased_at" timestamptz,
	"submitted_at" timestamptz,
	"send_failed_at" timestamptz,
	"send_failed_kind" text,
	"matched_donation_id" text,
	"matched_at" timestamptz,
	"voided_at" timestamptz,
	"void_reason" text,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "donation_match_events_send_failed_kind_check" CHECK ("donation_match_events"."send_failed_kind" IS NULL OR "donation_match_events"."send_failed_kind" IN ('pack','chase')),
	CONSTRAINT "donation_match_events_send_failed_pair_check" CHECK (("donation_match_events"."send_failed_at" IS NULL) = ("donation_match_events"."send_failed_kind" IS NULL)),
	CONSTRAINT "donation_match_events_matched_pair_check" CHECK (("donation_match_events"."matched_at" IS NULL) = ("donation_match_events"."matched_donation_id" IS NULL)),
	CONSTRAINT "donation_match_events_void_reason_check" CHECK ("donation_match_events"."void_reason" IS NULL OR "donation_match_events"."void_reason" IN ('refunded','refunded_loss')),
	CONSTRAINT "donation_match_events_void_pair_check" CHECK (("donation_match_events"."voided_at" IS NULL) = ("donation_match_events"."void_reason" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "donation_match_events" ADD CONSTRAINT "donation_match_events_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_match_events" ADD CONSTRAINT "donation_match_events_matched_donation_id_donations_id_fk" FOREIGN KEY ("matched_donation_id") REFERENCES "public"."donations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "donation_match_events_donation_id_idx" ON "donation_match_events" USING btree ("donation_id");