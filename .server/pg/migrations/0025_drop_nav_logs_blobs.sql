ALTER TABLE "nav_logs" DROP COLUMN "composition";--> statement-breakpoint
ALTER TABLE "nav_logs" DROP COLUMN "value";--> statement-breakpoint
CREATE OR REPLACE FUNCTION nav_logs_require_children()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM nav_log_positions WHERE date = NEW.date) THEN
    RAISE EXCEPTION 'nav_logs % has no nav_log_positions', NEW.date;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER nav_logs_children_check
AFTER INSERT ON nav_logs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION nav_logs_require_children();
