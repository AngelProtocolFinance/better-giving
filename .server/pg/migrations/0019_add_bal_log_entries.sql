CREATE TABLE "bal_log_entries" (
	"date" timestamptz NOT NULL,
	"npo_id" integer NOT NULL,
	"balance" numeric(38, 18) NOT NULL,
	CONSTRAINT "bal_log_entries_date_npo_id_pk" PRIMARY KEY("date","npo_id"),
	CONSTRAINT "bal_log_entries_balance_nonneg" CHECK ("bal_log_entries"."balance" >= 0)
);
--> statement-breakpoint
ALTER TABLE "bal_log_entries" ADD CONSTRAINT "bal_log_entries_date_bal_logs_date_fk" FOREIGN KEY ("date") REFERENCES "public"."bal_logs"("date") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bal_log_entries" ADD CONSTRAINT "bal_log_entries_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bal_log_entries_npo_idx" ON "bal_log_entries" USING btree ("npo_id","date" DESC NULLS LAST);