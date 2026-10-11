SET LOCAL lock_timeout = '2s';--> statement-breakpoint
ALTER TABLE "owed_amounts" DROP CONSTRAINT "owed_amounts_settled_within_owed_check";--> statement-breakpoint
ALTER TABLE "owed_amounts" ADD CONSTRAINT "owed_amounts_settled_within_owed_check" CHECK ("owed_amounts"."credited_back_usd" + "owed_amounts"."written_off_usd"
          <= "owed_amounts"."received_usd" + "owed_amounts"."fee_processing_usd" + "owed_amounts"."fee_dispute_usd"
        AND "owed_amounts"."recovered_usd" + "owed_amounts"."written_off_usd" <= "owed_amounts"."received_usd" + "owed_amounts"."fee_processing_usd" + "owed_amounts"."fee_dispute_usd") NOT VALID;--> statement-breakpoint
ALTER TABLE "owed_amounts" VALIDATE CONSTRAINT "owed_amounts_settled_within_owed_check";--> statement-breakpoint
ALTER TABLE "loss_logs" DROP CONSTRAINT "loss_logs_type_check";--> statement-breakpoint
ALTER TABLE "loss_logs" ADD CONSTRAINT "loss_logs_type_check" CHECK ("loss_logs"."type" IN ('balance_liq','balance_lock','payout','write_off')) NOT VALID;--> statement-breakpoint
ALTER TABLE "loss_logs" VALIDATE CONSTRAINT "loss_logs_type_check";--> statement-breakpoint
ALTER TABLE "loss_logs" ALTER COLUMN "dist_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "loss_logs" ALTER COLUMN "npo_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "loss_logs" ADD COLUMN "referrer_user" text;--> statement-breakpoint
ALTER TABLE "loss_logs" ADD COLUMN "referrer_npo" text;--> statement-breakpoint
ALTER TABLE "loss_logs" ADD COLUMN "actor" text;--> statement-breakpoint
ALTER TABLE "loss_logs" ADD CONSTRAINT "loss_logs_referrer_user_user_referral_code_fk" FOREIGN KEY ("referrer_user") REFERENCES "public"."user"("referral_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_logs" ADD CONSTRAINT "loss_logs_referrer_npo_npos_referral_id_fk" FOREIGN KEY ("referrer_npo") REFERENCES "public"."npos"("referral_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_logs" ADD CONSTRAINT "loss_logs_actor_user_id_fk" FOREIGN KEY ("actor") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_logs" ADD CONSTRAINT "loss_logs_party_xor" CHECK (num_nonnulls("loss_logs"."npo_id", "loss_logs"."referrer_user", "loss_logs"."referrer_npo") = 1) NOT VALID;--> statement-breakpoint
ALTER TABLE "loss_logs" VALIDATE CONSTRAINT "loss_logs_party_xor";--> statement-breakpoint
ALTER TABLE "loss_logs" ADD CONSTRAINT "loss_logs_write_off_check" CHECK (CASE WHEN "loss_logs"."type" = 'write_off' THEN "loss_logs"."actor" IS NOT NULL ELSE "loss_logs"."dist_id" IS NOT NULL END) NOT VALID;--> statement-breakpoint
ALTER TABLE "loss_logs" VALIDATE CONSTRAINT "loss_logs_write_off_check";
