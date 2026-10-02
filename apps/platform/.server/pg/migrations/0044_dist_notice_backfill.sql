SET LOCAL lock_timeout = '2s';--> statement-breakpoint
-- a settled dist no claim ever touched was notified by the code before 0042's stamps: its mail, metric and hooks already ran, so a replayed don-dist must find it done.
-- a claimed one is tracked per step, and its missing stamps are a retry still owed.
-- an unclaimed one settled within the hour may still have its first don-dist queued, so it keeps that delivery.
UPDATE "dists" SET
  "notice_sent_at" = coalesce("notice_sent_at", now()),
  "metric_counted_at" = coalesce("metric_counted_at", now()),
  "hooks_sent_at" = coalesce("hooks_sent_at", now())
WHERE "status" = 'settled'
  AND "notice_claimed_at" IS NULL
  AND "date_created" < now() - interval '1 hour'
  AND ("notice_sent_at" IS NULL OR "metric_counted_at" IS NULL OR "hooks_sent_at" IS NULL);
