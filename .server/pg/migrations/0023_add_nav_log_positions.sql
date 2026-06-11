CREATE TABLE "nav_log_positions" (
	"date" timestamptz NOT NULL,
	"ticker" text NOT NULL,
	"qty" numeric(38, 18) NOT NULL,
	"price" numeric(38, 18) NOT NULL,
	"value" numeric(38, 18) NOT NULL,
	"price_date" timestamptz NOT NULL,
	CONSTRAINT "nav_log_positions_date_ticker_pk" PRIMARY KEY("date","ticker"),
	CONSTRAINT "nav_log_positions_qty_nonneg" CHECK ("nav_log_positions"."qty" >= 0),
	CONSTRAINT "nav_log_positions_price_nonneg" CHECK ("nav_log_positions"."price" >= 0),
	CONSTRAINT "nav_log_positions_value_eq_qty_price" CHECK ("nav_log_positions"."value" = "nav_log_positions"."qty" * "nav_log_positions"."price")
);
--> statement-breakpoint
ALTER TABLE "nav_log_positions" ADD CONSTRAINT "nav_log_positions_date_nav_logs_date_fk" FOREIGN KEY ("date") REFERENCES "public"."nav_logs"("date") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nav_log_positions" ADD CONSTRAINT "nav_log_positions_ticker_tickers_id_fk" FOREIGN KEY ("ticker") REFERENCES "public"."tickers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nav_log_positions_ticker_idx" ON "nav_log_positions" USING btree ("ticker","date" DESC NULLS LAST);--> statement-breakpoint
INSERT INTO "tickers" ("id") VALUES
  ('IVV'),('FLOT'),('QQQ'),('BNDX'),('FNDF'),('IEFA'),('CASH'),
  ('ETH'),('BTC'),('QQQM'),('BSV'),('BND'),('SIVR'),('GLDM'),('VTV')
ON CONFLICT ("id") DO NOTHING;