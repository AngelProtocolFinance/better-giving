ALTER TABLE "rebalance_logs" DROP COLUMN "txs";--> statement-breakpoint
ALTER TABLE "rebalance_logs" DROP COLUMN "bals";--> statement-breakpoint
CREATE OR REPLACE FUNCTION rebalance_logs_require_children()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rebalance_log_txs WHERE rebalance_log_id = NEW.id) THEN
    RAISE EXCEPTION 'rebalance_logs % has no rebalance_log_txs', NEW.id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER rebalance_logs_children_check
AFTER INSERT ON rebalance_logs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION rebalance_logs_require_children();
