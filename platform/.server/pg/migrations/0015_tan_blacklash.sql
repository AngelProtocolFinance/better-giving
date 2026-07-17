ALTER TABLE "user_invites" ADD COLUMN "npo_id" integer;--> statement-breakpoint
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_npo_id_npos_id_fk" FOREIGN KEY ("npo_id") REFERENCES "public"."npos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_invites_npo_id_idx" ON "user_invites" USING btree ("npo_id");