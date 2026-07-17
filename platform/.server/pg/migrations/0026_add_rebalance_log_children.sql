CREATE TABLE "rebalance_log_bals" (
	"rebalance_log_id" text NOT NULL,
	"ticker" text NOT NULL,
	"balance" numeric(38, 18) NOT NULL,
	CONSTRAINT "rebalance_log_bals_rebalance_log_id_ticker_pk" PRIMARY KEY("rebalance_log_id","ticker"),
	CONSTRAINT "rebalance_log_bals_nonneg" CHECK ("rebalance_log_bals"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rebalance_log_txs" (
	"rebalance_log_id" text NOT NULL,
	"tx_id" text NOT NULL,
	"in_id" text NOT NULL,
	"out_id" text NOT NULL,
	"in_qty" numeric(38, 18) NOT NULL,
	"out_qty" numeric(38, 18) NOT NULL,
	"price" numeric(38, 18) NOT NULL,
	"fee" numeric(38, 18) NOT NULL,
	CONSTRAINT "rebalance_log_txs_rebalance_log_id_tx_id_pk" PRIMARY KEY("rebalance_log_id","tx_id"),
	CONSTRAINT "rebalance_log_txs_in_qty_gt0" CHECK ("rebalance_log_txs"."in_qty" > 0),
	CONSTRAINT "rebalance_log_txs_out_qty_gt0" CHECK ("rebalance_log_txs"."out_qty" > 0),
	CONSTRAINT "rebalance_log_txs_price_gt0" CHECK ("rebalance_log_txs"."price" > 0),
	CONSTRAINT "rebalance_log_txs_fee_nonneg" CHECK ("rebalance_log_txs"."fee" >= 0),
	CONSTRAINT "rebalance_log_txs_distinct" CHECK ("rebalance_log_txs"."in_id" <> "rebalance_log_txs"."out_id"),
	CONSTRAINT "rebalance_log_txs_cash_side" CHECK ('CASH' IN ("rebalance_log_txs"."in_id", "rebalance_log_txs"."out_id"))
);
--> statement-breakpoint
ALTER TABLE "rebalance_log_bals" ADD CONSTRAINT "rebalance_log_bals_rebalance_log_id_rebalance_logs_id_fk" FOREIGN KEY ("rebalance_log_id") REFERENCES "public"."rebalance_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebalance_log_bals" ADD CONSTRAINT "rebalance_log_bals_ticker_tickers_id_fk" FOREIGN KEY ("ticker") REFERENCES "public"."tickers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebalance_log_txs" ADD CONSTRAINT "rebalance_log_txs_rebalance_log_id_rebalance_logs_id_fk" FOREIGN KEY ("rebalance_log_id") REFERENCES "public"."rebalance_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebalance_log_txs" ADD CONSTRAINT "rebalance_log_txs_in_id_tickers_id_fk" FOREIGN KEY ("in_id") REFERENCES "public"."tickers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebalance_log_txs" ADD CONSTRAINT "rebalance_log_txs_out_id_tickers_id_fk" FOREIGN KEY ("out_id") REFERENCES "public"."tickers"("id") ON DELETE no action ON UPDATE no action;