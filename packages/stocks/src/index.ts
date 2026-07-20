import brokers_json from "./generated/brokers.json" with { type: "json" };
import tickers_json from "./generated/tickers.json" with { type: "json" };
import type { ITicker } from "./types";

export * from "./types";

export const tickers: ITicker[] = tickers_json;
export const brokers: string[] = brokers_json;
