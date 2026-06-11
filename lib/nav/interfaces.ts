export type {
  IBals,
  INpoSeriesOpts,
  IRebalanceLog,
  IRebalanceLogDb,
  IRebalancePayload,
  IRebalanceTx,
  IRebalanceTxDb,
} from "./schemas";

export interface ITicker {
  /** uppercase ticker */
  id: string;
  qty: number;
  price_date: string;
  price: number;
  /** qty * price */
  value: number;
}

/** ticker: uppercase, ITicker */
export interface IComposition extends Record<string, ITicker> {}

export interface ILog {
  /** rebalance, purchase, redemption */
  reason: string;
  date: string;
  units: number;
  /** usd per unit */
  price: number;
  /** modified by price updator */
  price_updated: string;
  composition: IComposition;
  /** total value of composition */
  value: number;
  /** holder-id, units */
  holders: Record<string, number>;
}

export interface IDividendLog {
  amount_usd: number;
  amount_units: number;
  /** matches investments tx record */
  date_created: string;
  id: string;
  per_npo_units: Record<string, number>;
}

export interface IDividendSimulComps {
  purchased_units: number;
  /** non zero unit holders only */
  per_npo_units: Record<string, number>;
  /** non zero unit holders only */
  per_npo_usd: Record<string, number>;
}

export interface IPageOptions {
  limit?: number;
  /** base64 */
  next?: string;
  fields?: string[];
  consistent?: boolean;
}

export interface ISeries {
  week?: boolean;
  day?: boolean;
}

export interface ISeriesPoint {
  date: string;
  value: number;
  price: number;
  units: number;
}

export type TickerCategory =
  | "equities"
  | "fixed_income"
  | "crypto"
  | "commodities"
  | "cash";

const ticker_categories: Record<string, TickerCategory> = {
  IEFA: "equities",
  QQQ: "equities",
  FNDF: "equities",
  IVV: "equities",
  QQQM: "equities",
  VTV: "equities",
  BNDX: "fixed_income",
  FLOT: "fixed_income",
  BSV: "fixed_income",
  BND: "fixed_income",
  BTC: "crypto",
  ETH: "crypto",
  SIVR: "commodities",
  GLDM: "commodities",
  CASH: "cash",
};

interface CategoryGroup {
  category: string;
  pct: number;
  tickers: { id: string; pct: number }[];
}

export function group_by_category(
  composition: IComposition,
  total_value: number
): CategoryGroup[] {
  const groups: Record<string, CategoryGroup> = {};

  for (const [id, ticker] of Object.entries(composition)) {
    const category = ticker_categories[id] ?? "other";
    const pct = total_value > 0 ? (ticker.value / total_value) * 100 : 0;

    if (!groups[category]) {
      groups[category] = { category, pct: 0, tickers: [] };
    }
    groups[category].pct += pct;
    groups[category].tickers.push({ id, pct });
  }

  // sort tickers within each group desc
  for (const g of Object.values(groups)) {
    g.tickers.sort((a, b) => b.pct - a.pct);
  }

  return Object.values(groups).sort((a, b) => b.pct - a.pct);
}
