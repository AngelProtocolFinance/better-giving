ALTER TABLE "registrations" ADD COLUMN "o_fsa_doc_eid" text;--> statement-breakpoint
CREATE INDEX "registrations_o_fsa_doc_eid_idx" ON "registrations" USING btree ("o_fsa_doc_eid");