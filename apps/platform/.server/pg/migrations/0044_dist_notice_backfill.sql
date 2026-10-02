SET LOCAL lock_timeout = '2s';--> statement-breakpoint
-- a settled dist with no claim and no stamp, provider-dated before 0042 shipped (eedbbbb), was notified by the code before the per-step stamps: its mail, metric and hooks already ran, so a replayed don-dist must find it done.
-- any stamp, or a claim, means the per-step code has touched the row (a released claim keeps its finished stamps), and its missing steps are a retry still owed.
-- residual: an ACH-style dist provider-dated before the cutoff but settled by the per-step code, whose first don-dist is still undelivered at migrate time, is stamped here and loses that notice.
-- the stamped now() is a backfill marker, not when the notice was sent.
UPDATE "dists" SET
  "notice_sent_at" = now(),
  "metric_counted_at" = now(),
  "hooks_sent_at" = now()
WHERE "status" = 'settled'
  AND "date_created" < '2026-10-02T04:15:40Z'
  AND "notice_claimed_at" IS NULL
  AND "notice_sent_at" IS NULL
  AND "metric_counted_at" IS NULL
  AND "hooks_sent_at" IS NULL;
