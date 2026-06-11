CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "user_bookmarks" (
	"user_id" text NOT NULL,
	"npo_id" integer NOT NULL,
	CONSTRAINT "user_bookmarks_user_id_npo_id_pk" PRIMARY KEY("user_id","npo_id")
);
--> statement-breakpoint
CREATE TABLE "user_fund_memberships" (
	"user_id" text NOT NULL,
	"fund_id" text NOT NULL,
	CONSTRAINT "user_fund_memberships_user_id_fund_id_pk" PRIMARY KEY("user_id","fund_id")
);
--> statement-breakpoint
CREATE TABLE "user_invites" (
	"invitee" text PRIMARY KEY NOT NULL,
	"invitee_first" text NOT NULL,
	"invitor_id" text NOT NULL,
	"npo_name" text NOT NULL,
	"expire_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_npo_memberships" (
	"user_id" text NOT NULL,
	"npo_id" integer NOT NULL,
	"alert_banking" boolean DEFAULT false NOT NULL,
	"alert_donation" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_npo_memberships_user_id_npo_id_pk" PRIMARY KEY("user_id","npo_id")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"npo_id" integer PRIMARY KEY NOT NULL,
	"api_key" text NOT NULL,
	"created_at" timestamptz,
	CONSTRAINT "api_keys_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
CREATE TABLE "npo_media" (
	"id" text PRIMARY KEY NOT NULL,
	"npo_id" integer NOT NULL,
	"url" text NOT NULL,
	"type" text NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"date_created" timestamptz,
	CONSTRAINT "npo_media_type_check" CHECK ("npo_media"."type" IN ('album', 'article', 'video'))
);
--> statement-breakpoint
CREATE TABLE "npos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "npos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text,
	"keyword" text,
	"registration_number" text NOT NULL,
	"name" text NOT NULL,
	"endow_designation" text NOT NULL,
	"overview" text,
	"tagline" text,
	"image" text,
	"logo" text,
	"card_img" text,
	"hq_country" text NOT NULL,
	"active_in_countries" text[] DEFAULT '{}' NOT NULL,
	"social_media_urls" jsonb,
	"url" text,
	"sdgs" integer[] DEFAULT '{}' NOT NULL,
	"receipt_msg" text,
	"hide_bg_tip" boolean DEFAULT false NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"prog_donations_allowed" boolean DEFAULT false NOT NULL,
	"allocation" jsonb,
	"donate_methods" text[],
	"donate_frequencies" text[],
	"increments" jsonb,
	"fund_opt_in" boolean DEFAULT false NOT NULL,
	"target_number" numeric(38, 18),
	"target_smart" boolean,
	"claimed" boolean DEFAULT true NOT NULL,
	"kyc_donors_only" boolean DEFAULT false NOT NULL,
	"fiscal_sponsored" boolean DEFAULT false NOT NULL,
	"referral_id" text,
	"referrer" text,
	"referrer_expiry" timestamptz,
	"w_form" text,
	"payout_minimum" numeric(38, 18),
	"street_address" text,
	"donor_address_required" boolean DEFAULT false NOT NULL,
	"liq" numeric(38, 18) DEFAULT 0 NOT NULL,
	"lock_units" numeric(38, 18) DEFAULT 0 NOT NULL,
	"cash" numeric(38, 18) DEFAULT 0 NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "npos_slug_unique" UNIQUE("slug"),
	CONSTRAINT "npos_keyword_unique" UNIQUE("keyword"),
	CONSTRAINT "npos_registration_number_unique" UNIQUE("registration_number"),
	CONSTRAINT "endow_designation_check" CHECK ("npos"."endow_designation" IN ('Charity', 'Religious Organization', 'University', 'Hospital', 'Other')),
	CONSTRAINT "target_xor" CHECK (num_nonnulls("npos"."target_number", "npos"."target_smart") <= 1)
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"npo_id" integer NOT NULL,
	"id" text NOT NULL,
	"url" text NOT NULL,
	CONSTRAINT "webhooks_npo_id_id_pk" PRIMARY KEY("npo_id","id")
);
--> statement-breakpoint
CREATE TABLE "fund_members" (
	"fund_id" text NOT NULL,
	"npo_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "fund_members_fund_id_npo_id_pk" PRIMARY KEY("fund_id","npo_id")
);
--> statement-breakpoint
CREATE TABLE "funds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"description" text NOT NULL,
	"banner" text NOT NULL,
	"logo" text NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"expiration" timestamptz,
	"target_number" numeric(38, 18),
	"target_smart" boolean,
	"videos" text[] DEFAULT '{}'::text[] NOT NULL,
	"increments" jsonb,
	"npo_owner" integer,
	"creator_id" text NOT NULL,
	"spam_score" numeric(5, 2),
	"hide_bg_tip" boolean DEFAULT false NOT NULL,
	"fund_donate_methods" text[],
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "funds_slug_unique" UNIQUE("slug"),
	CONSTRAINT "target_xor" CHECK (num_nonnulls("funds"."target_number", "funds"."target_smart") <= 1)
);
--> statement-breakpoint
CREATE TABLE "donation_donors" (
	"donation_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"title" text,
	"company_name" text,
	"addr" jsonb,
	"wallet_addr" text,
	"public_msg" text,
	"private_msg" text,
	"is_public" boolean
);
--> statement-breakpoint
CREATE TABLE "donation_recipients" (
	"donation_id" text PRIMARY KEY NOT NULL,
	"npo_id" integer,
	"fund_id" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"tip_allowed" boolean,
	"members" integer[],
	CONSTRAINT "type_check" CHECK ("donation_recipients"."type" IN ('npo','fund')),
	CONSTRAINT "recipient_xor" CHECK (num_nonnulls("donation_recipients"."npo_id", "donation_recipients"."fund_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "donation_settlements" (
	"donation_id" text PRIMARY KEY NOT NULL,
	"sttl_id" text NOT NULL,
	"date" timestamptz NOT NULL,
	"currency" text NOT NULL,
	"net" numeric(38, 18) NOT NULL,
	"fee" numeric(38, 18) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donation_tributes" (
	"donation_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"notif_email" text,
	"notif_fullname" text,
	"notif_msg" text
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" text PRIMARY KEY NOT NULL,
	"id_v1" text,
	"upusd" numeric(38, 18) NOT NULL,
	"status" text NOT NULL,
	"amount_base" numeric(38, 18) NOT NULL,
	"amount_tip" numeric(38, 18) NOT NULL,
	"amount_fee_allowance" numeric(38, 18) NOT NULL,
	"currency" text NOT NULL,
	"frequency" text NOT NULL,
	"source" text NOT NULL,
	"via" text NOT NULL,
	"source_id" text,
	"via_extra" text,
	"program_id" text,
	"program_name" text,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "donations_id_v1_unique" UNIQUE("id_v1"),
	CONSTRAINT "status_check" CHECK ("donations"."status" IN ('created','intent','expired','confirmed','settled','failed','refunded','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "dists" (
	"id" text PRIMARY KEY NOT NULL,
	"donation_id" text NOT NULL,
	"status" text NOT NULL,
	"date_created" timestamptz NOT NULL,
	"to_id" integer,
	"to_name" text,
	"to_claimed" boolean,
	"to_fiscal_sponsored" boolean,
	"amount" numeric(38, 18),
	"amount_usd" numeric(38, 18),
	"amount_denom" text NOT NULL,
	"net" numeric(38, 18),
	"fee_base" numeric(38, 18),
	"fee_fsa" numeric(38, 18),
	"fee_processing" numeric(38, 18),
	"fee_allowance" numeric(38, 18),
	"fee_allowance_excess" numeric(38, 18),
	"fund_id" text,
	"alloc" jsonb,
	"refund_status" text,
	"refund_error" text,
	CONSTRAINT "dists_donation_id_to_id_uniq" UNIQUE("donation_id","to_id"),
	CONSTRAINT "dists_status_check" CHECK ("dists"."status" IN ('settled','refunded'))
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"date" timestamptz,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"media" text
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" text PRIMARY KEY NOT NULL,
	"npo_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"banner" text,
	"target_raise" numeric(38, 18),
	"total_donations" numeric(38, 18) DEFAULT 0,
	"created_at" timestamptz
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_npo_id" integer,
	"owner_user_id" text,
	"status" text,
	"tag" text,
	"name" text NOT NULL,
	"recipient_npo_id" integer,
	"recipient_fund_id" text,
	"date_created" timestamptz,
	"ltd" numeric(38, 18) DEFAULT 0,
	"ltd_count" integer DEFAULT 0,
	"target_number" numeric(38, 18),
	"target_smart" boolean,
	"accent_primary" text,
	"accent_secondary" text,
	"success_redirect" text,
	"donate_methods" text[],
	"freq_opts" text[],
	"increments" jsonb,
	"program_id" text,
	"program_name" text,
	"defaults" jsonb,
	CONSTRAINT "forms_status_check" CHECK ("forms"."status" IN ('active', 'inactive')),
	CONSTRAINT "recipient_xor" CHECK (num_nonnulls("forms"."recipient_npo_id", "forms"."recipient_fund_id") <= 1),
	CONSTRAINT "owner_xor" CHECK (num_nonnulls("forms"."owner_npo_id", "forms"."owner_user_id") = 1),
	CONSTRAINT "target_xor" CHECK (num_nonnulls("forms"."target_number", "forms"."target_smart") <= 1)
);
--> statement-breakpoint
CREATE TABLE "bal_txs" (
	"id" text PRIMARY KEY NOT NULL,
	"date_created" timestamptz NOT NULL,
	"date_updated" timestamptz NOT NULL,
	"npo_id" text NOT NULL,
	"account" text NOT NULL,
	"bal_begin" numeric(38, 18) NOT NULL,
	"bal_end" numeric(38, 18) NOT NULL,
	"amount" numeric(38, 18) NOT NULL,
	"amount_units" numeric(38, 18) NOT NULL,
	"status" text NOT NULL,
	"account_other_id" text,
	"account_other" text,
	"account_other_bal_begin" numeric(38, 18),
	"account_other_bal_end" numeric(38, 18),
	CONSTRAINT "account_check" CHECK ("bal_txs"."account" IN ('liq','lock','grant','donation','interest','dividend','refund')),
	CONSTRAINT "status_check" CHECK ("bal_txs"."status" IN ('pending','final','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "banking_apps" (
	"id" text PRIMARY KEY NOT NULL,
	"npo_id" integer NOT NULL,
	"status" text DEFAULT 'under-review' NOT NULL,
	"bank_summary" text DEFAULT '' NOT NULL,
	"bank_statement_url" text DEFAULT '' NOT NULL,
	"rejection_reason" text DEFAULT '' NOT NULL,
	"date_created" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "banking_apps_status_check" CHECK ("banking_apps"."status" IN ('default', 'under-review', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "loss_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"date" timestamptz NOT NULL,
	"donation_id" text NOT NULL,
	"dist_id" text NOT NULL,
	"npo_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(38, 18) NOT NULL,
	"npo_amount" numeric(38, 18) NOT NULL,
	"fees_bg" numeric(38, 18) NOT NULL,
	"fees_processing" numeric(38, 18) NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "loss_logs_type_check" CHECK ("loss_logs"."type" IN ('balance_liq','balance_lock','payout'))
);
--> statement-breakpoint
CREATE TABLE "rev_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"date" timestamptz NOT NULL,
	"donation_id" text NOT NULL,
	"npo_id" integer,
	"fund_id" text,
	"npo_name" text,
	"type" text NOT NULL,
	"gross" numeric(38, 18) NOT NULL,
	"commission" numeric(38, 18) NOT NULL,
	"revenue" numeric(38, 18) NOT NULL,
	"status" text NOT NULL,
	"type_tip" jsonb,
	CONSTRAINT "rev_logs_type_check" CHECK ("rev_logs"."type" IN ('tip','base-fee','fsa-fee')),
	CONSTRAINT "rev_logs_status_check" CHECK ("rev_logs"."status" IN ('final','refunded'))
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"npo_id" text NOT NULL,
	"source" text NOT NULL,
	"date" timestamptz NOT NULL,
	"amount" numeric(38, 18) NOT NULL,
	"type" text NOT NULL,
	"message" text,
	"settled_date" timestamptz,
	"settled_id" text,
	CONSTRAINT "source_check" CHECK ("payouts"."source" IN ('donation','liq','lock')),
	CONSTRAINT "amount_check" CHECK ("payouts"."amount" > 0),
	CONSTRAINT "type_check" CHECK ("payouts"."type" IN ('pending','settled','error','refunded','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"other_id" text,
	"npo_id" text,
	"date" timestamptz NOT NULL,
	"amount" numeric(38, 18) NOT NULL,
	"sources" text[],
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"interval" text NOT NULL,
	"interval_count" integer NOT NULL,
	"next_billing" timestamptz NOT NULL,
	"amount" numeric(38, 18) NOT NULL,
	"amount_usd" numeric(38, 18) NOT NULL,
	"currency" text NOT NULL,
	"product_id" text NOT NULL,
	"to_npo_id" integer,
	"to_fund_id" text,
	"to_name" text NOT NULL,
	"platform" text NOT NULL,
	"status" text NOT NULL,
	"status_cancel_reason" text,
	"from_id" text NOT NULL,
	"created_at" timestamptz NOT NULL,
	"updated_at" timestamptz NOT NULL,
	CONSTRAINT "interval_check" CHECK ("subscriptions"."interval" IN ('day','month','week','year')),
	CONSTRAINT "recipient_xor" CHECK (num_nonnulls("subscriptions"."to_npo_id", "subscriptions"."to_fund_id") = 1),
	CONSTRAINT "platform_check" CHECK ("subscriptions"."platform" IN ('stripe','paypal')),
	CONSTRAINT "status_check" CHECK ("subscriptions"."status" IN ('active','inactive'))
);
--> statement-breakpoint
CREATE TABLE "donation_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"donation_id" text,
	"npo_id" text,
	"donor_name" text,
	"donor_message" text,
	"date" timestamptz,
	"amount" numeric(38, 18)
);
--> statement-breakpoint
CREATE TABLE "referrer_commissions" (
	"referrer" text NOT NULL,
	"date" timestamptz NOT NULL,
	"donation_id" text NOT NULL,
	"npo_id" integer NOT NULL,
	"amount" numeric(38, 18) NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "referrer_commissions_referrer_date_pk" PRIMARY KEY("referrer","date"),
	CONSTRAINT "status_check" CHECK ("referrer_commissions"."status" IN ('pending','paid','refunded'))
);
--> statement-breakpoint
CREATE TABLE "referrer_payouts" (
	"referrer" text NOT NULL,
	"date" timestamptz NOT NULL,
	"id" text,
	"amount" numeric(38, 18) NOT NULL,
	"error" text,
	"transfer_id" bigint,
	CONSTRAINT "referrer_payouts_referrer_date_pk" PRIMARY KEY("referrer","date"),
	CONSTRAINT "referrer_payouts_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "nav_holders" (
	"date" timestamptz NOT NULL,
	"npo_id" integer NOT NULL,
	"units" numeric(38, 18) NOT NULL,
	CONSTRAINT "nav_holders_date_npo_id_pk" PRIMARY KEY("date","npo_id")
);
--> statement-breakpoint
CREATE TABLE "nav_logs" (
	"date" timestamptz PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"units" numeric(38, 18) NOT NULL,
	"price" numeric(38, 18) NOT NULL,
	"price_updated" timestamptz,
	"composition" jsonb NOT NULL,
	"value" numeric(38, 18) NOT NULL,
	"is_week" boolean DEFAULT false,
	"is_day" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "bal_logs" (
	"date" timestamptz PRIMARY KEY NOT NULL,
	"balances" jsonb NOT NULL,
	"total" numeric(38, 18) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dividend_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"date_created" timestamptz NOT NULL,
	"amount_usd" numeric(38, 18) NOT NULL,
	"amount_units" numeric(38, 18) NOT NULL,
	"per_npo_units" jsonb NOT NULL,
	"per_npo_credit_status" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intr_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"date_created" timestamptz NOT NULL,
	"total" numeric(38, 18) NOT NULL,
	"date_start" timestamptz NOT NULL,
	"date_end" timestamptz NOT NULL,
	"alloc" jsonb NOT NULL,
	"alloc_status" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rebalance_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"date" timestamptz,
	"txs" jsonb,
	"bals" jsonb
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"r_id" text NOT NULL,
	"status" text,
	"r_first_name" text,
	"r_last_name" text,
	"r_phone" text,
	"r_email" text,
	"r_org_role" text,
	"r_org_role_other" text,
	"r_contact_number" text,
	"rm" text,
	"rm_referral_code" text,
	"rm_other" text,
	"o_name" text,
	"o_registration_number" text,
	"o_country" text,
	"o_hq_country" text,
	"o_street" text,
	"o_city" text,
	"o_state" text,
	"o_zip" text,
	"o_designation" text,
	"o_website" text,
	"o_sdgs" integer[],
	"o_active_in_countries" text[],
	"o_type" text,
	"o_ein" text,
	"o_legal_entity_type" text,
	"o_project_description" text,
	"r_proof_of_identity" text,
	"o_proof_of_reg" text,
	"o_fsa_signing_url" text,
	"o_fsa_signed_doc_url" text,
	"o_bank_id" text,
	"o_bank_statement" text,
	"o_image" text,
	"o_logo" text,
	"o_banner" text,
	"o_overview" text,
	"status_rejected_reason" text,
	"status_approved_npo_id" integer,
	"claim" jsonb,
	"created_at" timestamptz,
	"updated_at" timestamptz,
	CONSTRAINT "status_check" CHECK ("registrations"."status" IN ('01','02','03','04'))
);
--> statement-breakpoint
CREATE TABLE "config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb
);
--> statement-breakpoint
CREATE TABLE "country_metrics" (
	"country_key" text PRIMARY KEY NOT NULL,
	"name" text,
	"total_donations" numeric(38, 18) DEFAULT 0,
	"total_donations_7d" numeric(38, 18) DEFAULT 0,
	"updated_at" timestamptz
);
--> statement-breakpoint
CREATE TABLE "currency_rates" (
	"base_currency" text PRIMARY KEY NOT NULL,
	"rates" jsonb,
	"updated_at" timestamptz
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text DEFAULT 'user',
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"referral_code" text,
	"pref_currency" text DEFAULT 'usd',
	"avatar_url" text,
	"pay_id" text,
	"pay_min" integer DEFAULT 0,
	"w_form" text,
	"signup_date" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_bookmarks" ADD CONSTRAINT "user_bookmarks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bookmarks" ADD CONSTRAINT "user_bookmarks_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_fund_memberships" ADD CONSTRAINT "user_fund_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_fund_memberships" ADD CONSTRAINT "user_fund_memberships_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_invitor_id_user_id_fk" FOREIGN KEY ("invitor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_npo_memberships" ADD CONSTRAINT "user_npo_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_npo_memberships" ADD CONSTRAINT "user_npo_memberships_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npo_media" ADD CONSTRAINT "npo_media_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_members" ADD CONSTRAINT "fund_members_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_members" ADD CONSTRAINT "fund_members_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funds" ADD CONSTRAINT "funds_npo_owner_npos_id_fk" FOREIGN KEY ("npo_owner") REFERENCES "public"."npos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funds" ADD CONSTRAINT "funds_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_donors" ADD CONSTRAINT "donation_donors_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_recipients" ADD CONSTRAINT "donation_recipients_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_recipients" ADD CONSTRAINT "donation_recipients_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_recipients" ADD CONSTRAINT "donation_recipients_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_settlements" ADD CONSTRAINT "donation_settlements_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_tributes" ADD CONSTRAINT "donation_tributes_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dists" ADD CONSTRAINT "dists_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dists" ADD CONSTRAINT "dists_to_id_npos_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."npos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_owner_npo_id_npos_id_fk" FOREIGN KEY ("owner_npo_id") REFERENCES "public"."npos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_recipient_npo_id_npos_id_fk" FOREIGN KEY ("recipient_npo_id") REFERENCES "public"."npos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_recipient_fund_id_funds_id_fk" FOREIGN KEY ("recipient_fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banking_apps" ADD CONSTRAINT "banking_apps_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_logs" ADD CONSTRAINT "loss_logs_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rev_logs" ADD CONSTRAINT "rev_logs_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rev_logs" ADD CONSTRAINT "rev_logs_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_to_npo_id_npos_id_fk" FOREIGN KEY ("to_npo_id") REFERENCES "public"."npos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_to_fund_id_funds_id_fk" FOREIGN KEY ("to_fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrer_commissions" ADD CONSTRAINT "referrer_commissions_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nav_holders" ADD CONSTRAINT "nav_holders_date_nav_logs_date_fk" FOREIGN KEY ("date") REFERENCES "public"."nav_logs"("date") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_bookmarks_npo_id_idx" ON "user_bookmarks" USING btree ("npo_id");--> statement-breakpoint
CREATE INDEX "user_fund_memberships_fund_id_idx" ON "user_fund_memberships" USING btree ("fund_id");--> statement-breakpoint
CREATE INDEX "user_npo_memberships_npo_id_idx" ON "user_npo_memberships" USING btree ("npo_id");--> statement-breakpoint
CREATE INDEX "npo_media_npo_id_type_idx" ON "npo_media" USING btree ("npo_id","type","featured","id");--> statement-breakpoint
CREATE INDEX "npos_published_name_idx" ON "npos" USING btree ("name") WHERE "npos"."published" = true;--> statement-breakpoint
CREATE INDEX "npos_referrer_idx" ON "npos" USING btree ("referrer") WHERE "npos"."referrer" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "npos_referral_id_idx" ON "npos" USING btree ("referral_id") WHERE "npos"."referral_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "npos_slug_lower_idx" ON "npos" USING btree (LOWER("slug")) WHERE "npos"."slug" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "npos_keyword_lower_idx" ON "npos" USING btree (LOWER("keyword")) WHERE "npos"."keyword" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "npos_search_trgm_idx" ON "npos" USING gin ((COALESCE("name",'') || ' ' || COALESCE("tagline",'') || ' ' || COALESCE("registration_number",'')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "fund_members_npo_id_idx" ON "fund_members" USING btree ("npo_id");--> statement-breakpoint
CREATE INDEX "funds_npo_owner_idx" ON "funds" USING btree ("npo_owner");--> statement-breakpoint
CREATE INDEX "funds_creator_id_idx" ON "funds" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "funds_created_at_idx" ON "funds" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "funds_search_trgm_idx" ON "funds" USING gin ((COALESCE("name",'') || ' ' || COALESCE("description",'')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "donation_donors_email_idx" ON "donation_donors" USING btree ("email");--> statement-breakpoint
CREATE INDEX "donation_recipients_fund_id_idx" ON "donation_recipients" USING btree ("fund_id");--> statement-breakpoint
CREATE INDEX "dists_donation_id_idx" ON "dists" USING btree ("donation_id");--> statement-breakpoint
CREATE INDEX "dists_to_id_date_idx" ON "dists" USING btree ("to_id","date_created");--> statement-breakpoint
CREATE INDEX "milestones_program_id_idx" ON "milestones" USING btree ("program_id","date");--> statement-breakpoint
CREATE INDEX "programs_npo_id_idx" ON "programs" USING btree ("npo_id","created_at");--> statement-breakpoint
CREATE INDEX "forms_owner_npo_date_idx" ON "forms" USING btree ("owner_npo_id","date_created") WHERE "forms"."owner_npo_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "forms_owner_email_date_idx" ON "forms" USING btree ("owner_user_id","date_created") WHERE "forms"."owner_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "forms_active_npo_idx" ON "forms" USING btree ("owner_npo_id","date_created") WHERE "forms"."status" = 'active' AND "forms"."owner_npo_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "bal_txs_status_date_idx" ON "bal_txs" USING btree ("status","date_created");--> statement-breakpoint
CREATE INDEX "bal_txs_npo_id_account_date_idx" ON "bal_txs" USING btree ("npo_id","account","date_created");--> statement-breakpoint
CREATE INDEX "bal_txs_account_status_date_idx" ON "bal_txs" USING btree ("account","status","date_created");--> statement-breakpoint
CREATE INDEX "bal_txs_pending_idx" ON "bal_txs" USING btree ("date_created") WHERE "bal_txs"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "banking_apps_npo_id_status_idx" ON "banking_apps" USING btree ("npo_id","status","date_created");--> statement-breakpoint
CREATE INDEX "banking_apps_status_date_idx" ON "banking_apps" USING btree ("status","date_created");--> statement-breakpoint
CREATE INDEX "banking_apps_under_review_idx" ON "banking_apps" USING btree ("date_created") WHERE "banking_apps"."status" = 'under-review';--> statement-breakpoint
CREATE INDEX "loss_logs_date_idx" ON "loss_logs" USING btree ("date");--> statement-breakpoint
CREATE INDEX "loss_logs_npo_id_idx" ON "loss_logs" USING btree ("npo_id");--> statement-breakpoint
CREATE INDEX "rev_logs_date_idx" ON "rev_logs" USING btree ("date");--> statement-breakpoint
CREATE INDEX "rev_logs_type_date_idx" ON "rev_logs" USING btree ("type","date");--> statement-breakpoint
CREATE INDEX "payouts_npo_id_date_idx" ON "payouts" USING btree ("npo_id","date");--> statement-breakpoint
CREATE INDEX "payouts_type_date_idx" ON "payouts" USING btree ("type","date");--> statement-breakpoint
CREATE INDEX "settlements_npo_id_date_idx" ON "settlements" USING btree ("npo_id","date");--> statement-breakpoint
CREATE INDEX "subscriptions_from_id_status_idx" ON "subscriptions" USING btree ("from_id","status","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_active_idx" ON "subscriptions" USING btree ("from_id","created_at") WHERE "subscriptions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "donation_messages_npo_id_date_idx" ON "donation_messages" USING btree ("npo_id","date");--> statement-breakpoint
CREATE INDEX "referrer_commissions_donation_id_idx" ON "referrer_commissions" USING btree ("donation_id");--> statement-breakpoint
CREATE INDEX "referrer_commissions_status_idx" ON "referrer_commissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "referrer_commissions_referrer_npo_id_idx" ON "referrer_commissions" USING btree ("referrer","npo_id");--> statement-breakpoint
CREATE INDEX "nav_holders_npo_id_idx" ON "nav_holders" USING btree ("npo_id");--> statement-breakpoint
CREATE INDEX "registrations_r_id_status_idx" ON "registrations" USING btree ("r_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "registrations_status_updated_idx" ON "registrations" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "registrations_search_trgm_idx" ON "registrations" USING gin ((COALESCE("o_name",'') || ' ' || "id") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE VIEW "public"."v_contributions" AS (SELECT to_id as npo_id, COALESCE(SUM(amount_usd), 0) as total, COUNT(*) as count FROM dists WHERE status = 'settled' GROUP BY to_id);--> statement-breakpoint
CREATE VIEW "public"."v_donation_total_usd" AS (SELECT fund_id, COALESCE(SUM(net), 0) as total FROM dists WHERE fund_id IS NOT NULL AND status = 'settled' GROUP BY fund_id);--> statement-breakpoint
CREATE VIEW "public"."v_loss_ltd" AS (SELECT npo_id, SUM(amount) as total FROM loss_logs GROUP BY npo_id);--> statement-breakpoint
CREATE VIEW "public"."v_referrer_commissions_ltd" AS (SELECT referrer, npo_id, SUM(amount) as total FROM referrer_commissions WHERE status = 'paid' GROUP BY referrer, npo_id);--> statement-breakpoint
CREATE VIEW "public"."v_referrer_payout_ltd" AS (SELECT referrer, SUM(amount) as total FROM referrer_payouts GROUP BY referrer);--> statement-breakpoint
CREATE VIEW "public"."v_rev_ltd" AS (SELECT npo_id, type, SUM(revenue) as total FROM rev_logs WHERE status = 'final' AND npo_id IS NOT NULL GROUP BY npo_id, type);