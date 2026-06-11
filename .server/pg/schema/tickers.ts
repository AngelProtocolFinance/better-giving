import { pgTable, text } from "drizzle-orm/pg-core";

export const tickers = pgTable("tickers", {
  id: text("id").primaryKey(),
});
