SET LOCAL lock_timeout = '2s';--> statement-breakpoint
CREATE TABLE "connector_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"npo_id" integer NOT NULL,
	"allowed_by" text NOT NULL,
	"iss" text NOT NULL,
	"expires_at" timestamptz NOT NULL,
	"used_at" timestamptz,
	CONSTRAINT "connector_codes_code_hash_hex" CHECK ("connector_codes"."code_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "connector_idempotency" (
	"key_id" text NOT NULL,
	"idem_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "connector_idempotency_key_id_idem_key_pk" PRIMARY KEY("key_id","idem_key"),
	CONSTRAINT "connector_idempotency_status_check" CHECK ("connector_idempotency"."status" in ('pending', 'stored')),
	CONSTRAINT "connector_idempotency_response_check" CHECK ((
        "connector_idempotency"."status" = 'pending'
        and "connector_idempotency"."response_status" is null
        and "connector_idempotency"."response_body" is null
      ) or (
        "connector_idempotency"."status" = 'stored'
        and "connector_idempotency"."response_status" is not null
        and "connector_idempotency"."response_body" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "connector_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"npo_id" integer NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"last4" text NOT NULL,
	"allowed_by" text NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"last_used_at" timestamptz,
	"revoked_at" timestamptz,
	"revoked_by" text,
	CONSTRAINT "connector_keys_key_hash_unique" UNIQUE("key_hash"),
	CONSTRAINT "connector_keys_key_hash_hex" CHECK ("connector_keys"."key_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "connector_keys_prefix_len" CHECK (char_length("connector_keys"."prefix") = 8),
	CONSTRAINT "connector_keys_last4_len" CHECK (char_length("connector_keys"."last4") = 4)
);
--> statement-breakpoint
ALTER TABLE "connector_codes" ADD CONSTRAINT "connector_codes_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_codes" ADD CONSTRAINT "connector_codes_allowed_by_user_id_fk" FOREIGN KEY ("allowed_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_idempotency" ADD CONSTRAINT "connector_idempotency_key_id_connector_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."connector_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_keys" ADD CONSTRAINT "connector_keys_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_keys" ADD CONSTRAINT "connector_keys_allowed_by_user_id_fk" FOREIGN KEY ("allowed_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_keys" ADD CONSTRAINT "connector_keys_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connector_keys_npo_id_live_idx" ON "connector_keys" USING btree ("npo_id") WHERE "connector_keys"."revoked_at" is null;