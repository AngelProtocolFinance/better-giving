ALTER TABLE "bal_txs" ALTER COLUMN "npo_id" SET DATA TYPE integer USING "npo_id"::integer;--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "npo_id" SET DATA TYPE integer USING "npo_id"::integer;--> statement-breakpoint
ALTER TABLE "settlements" ALTER COLUMN "npo_id" SET DATA TYPE integer USING "npo_id"::integer;--> statement-breakpoint
ALTER TABLE "bal_txs" ADD CONSTRAINT "bal_txs_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_settled_id_settlements_id_fk" FOREIGN KEY ("settled_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE no action ON UPDATE no action;