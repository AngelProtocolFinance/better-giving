SET LOCAL lock_timeout = '2s';--> statement-breakpoint
-- one statement: the old key is dropped and the new one built under a single ACCESS EXCLUSIVE lock, so no moment exists without a key
ALTER TABLE "user_invites"
  DROP CONSTRAINT "user_invites_pkey",
  ALTER COLUMN "npo_id" SET NOT NULL,
  ADD CONSTRAINT "user_invites_invitee_npo_id_pk" PRIMARY KEY("invitee","npo_id");
