SET LOCAL lock_timeout = '2s';--> statement-breakpoint
CREATE TABLE "donation_disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"donation_id" text NOT NULL,
	"status" text NOT NULL,
	"opened_at" timestamptz NOT NULL,
	"closed_at" timestamptz,
	CONSTRAINT "donation_disputes_status_check" CHECK ("donation_disputes"."status" IN ('open','lost','won')),
	CONSTRAINT "donation_disputes_closed_check" CHECK (("donation_disputes"."status" = 'open') = ("donation_disputes"."closed_at" IS NULL)),
	CONSTRAINT "donation_disputes_id_check" CHECK ("donation_disputes"."id" <> '')
);
--> statement-breakpoint
ALTER TABLE "donation_disputes" ADD CONSTRAINT "donation_disputes_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "donation_disputes_donation_id_idx" ON "donation_disputes" USING btree ("donation_id");