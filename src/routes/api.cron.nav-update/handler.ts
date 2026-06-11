import { isMonday } from "date-fns";
import { YYYYMMDD } from "@/helpers/date";
import type { ILog } from "@/nav";
import { db } from "$/pg/db";
import { nav_log_put, nav_ltd } from "$/pg/queries/nav";
import { update_tickers } from "./update-tickers";

export async function index() {
  const now = new Date();
  const now_day_num = YYYYMMDD(now);

  const latest = await nav_ltd();

  if (latest.units === 0) {
    console.info("portfolio has 0 units");
    return { statusCode: 201 };
  }

  const ltd_day_num = YYYYMMDD(latest.price_updated);

  if (now_day_num === ltd_day_num) {
    console.info(`No updates needed for day ${now_day_num}`);
    return { statusCode: 202 };
  }

  const updated_tickers = await update_tickers(
    Object.values(latest.composition)
  );

  const portfolio_value = updated_tickers.reduce((acc, t) => acc + t.value, 0);

  const timestamp = now.toISOString();
  const updated_ltd: ILog = {
    ...latest,
    reason: "daily price update",
    date: timestamp,
    composition: Object.fromEntries(updated_tickers.map((t) => [t.id, t])),
    price: portfolio_value / latest.units,
    price_updated: timestamp,
    value: portfolio_value,
    holders: Object.fromEntries(
      Object.entries(latest.holders).filter(([_, v]) => v > 0)
    ),
  };

  await nav_log_put(db, updated_ltd, { day: true, week: isMonday(now) });
  console.info("Updated LTD:", updated_ltd);
  return { statusCode: 200 };
}
