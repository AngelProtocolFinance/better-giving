ALTER TABLE "bal_logs" DROP COLUMN "balances";--> statement-breakpoint
ALTER TABLE "bal_logs" DROP COLUMN "total";--> statement-breakpoint
CREATE OR REPLACE FUNCTION bal_logs_require_children()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM bal_log_entries WHERE date = NEW.date) THEN
    RAISE EXCEPTION 'bal_logs % has no bal_log_entries', NEW.date;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER bal_logs_children_check
AFTER INSERT ON bal_logs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION bal_logs_require_children();
