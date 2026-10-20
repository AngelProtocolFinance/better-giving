SET LOCAL lock_timeout = '2s';--> statement-breakpoint
CREATE TABLE "campaign_members" (
	"campaign_id" text NOT NULL,
	"npo_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "campaign_members_campaign_id_npo_id_pk" PRIMARY KEY("campaign_id","npo_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_npo_id" integer,
	"owner_user_id" text,
	"creator_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"campaign_type" text,
	"description_pt" text DEFAULT '[]' NOT NULL,
	"description_v2" text,
	"banner" text,
	"logo" text,
	"videos" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamptz,
	"ends_at" timestamptz,
	"spam_score" numeric(5, 2),
	"donate_methods" text[],
	"donate_frequencies" text[],
	"increments" jsonb,
	"target_number" numeric(38, 18),
	"target_smart" boolean,
	"hide_bg_tip" boolean DEFAULT false NOT NULL,
	"program_id" text,
	"program_name" text,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "owner_xor" CHECK (num_nonnulls("campaigns"."owner_npo_id", "campaigns"."owner_user_id") = 1),
	CONSTRAINT "campaigns_type_check" CHECK ("campaigns"."campaign_type" IS NULL OR "campaigns"."campaign_type" IN ('year_end','emergency','building','event','tribute','monthly','program','other')),
	CONSTRAINT "campaigns_status_check" CHECK ("campaigns"."status" IN ('draft','live','ended')),
	CONSTRAINT "target_xor" CHECK (num_nonnulls("campaigns"."target_number", "campaigns"."target_smart") <= 1)
);
--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "campaign_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "campaign_id" text;--> statement-breakpoint
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_npo_id_npos_id_fk" FOREIGN KEY ("owner_npo_id") REFERENCES "public"."npos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_members_npo_id_idx" ON "campaign_members" USING btree ("npo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_owner_npo_slug_idx" ON "campaigns" USING btree ("owner_npo_id",LOWER("slug")) WHERE "campaigns"."owner_npo_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_owner_user_slug_idx" ON "campaigns" USING btree ("owner_user_id",LOWER("slug")) WHERE "campaigns"."owner_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "campaigns_owner_npo_id_idx" ON "campaigns" USING btree ("owner_npo_id");--> statement-breakpoint
CREATE INDEX "campaigns_creator_id_idx" ON "campaigns" USING btree ("creator_id");--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "donations_campaign_id_idx" ON "donations" USING btree ("campaign_id");--> statement-breakpoint
CREATE VIEW "public"."v_campaign_total_usd" AS (SELECT d.campaign_id, COALESCE(SUM(dists.net), 0) as total FROM donations d INNER JOIN dists ON dists.donation_id = d.id WHERE d.campaign_id IS NOT NULL AND dists.status = 'settled' GROUP BY d.campaign_id);--> statement-breakpoint
CREATE FUNCTION campaign_member_is_owner() RETURNS trigger AS $$
DECLARE
  owner int;
  n int;
BEGIN
  SELECT owner_npo_id INTO owner FROM campaigns WHERE id = NEW.campaign_id;
  IF owner IS NULL OR owner <> NEW.npo_id THEN
    RAISE EXCEPTION 'campaign member must be the owning nonprofit';
  END IF;
  SELECT count(*) INTO n FROM campaign_members WHERE campaign_id = NEW.campaign_id;
  IF TG_OP = 'INSERT' AND n >= 1 THEN
    RAISE EXCEPTION 'a campaign has one member, its owner';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER campaign_members_owner
BEFORE INSERT OR UPDATE ON campaign_members
FOR EACH ROW EXECUTE FUNCTION campaign_member_is_owner();