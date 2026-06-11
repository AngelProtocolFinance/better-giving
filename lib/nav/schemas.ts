import * as v from "valibot";
import { endOfDay, iso_date } from "../helpers/date";
import { $num_gt0_fn, $req } from "../schemas";

export const tickers: string[] = [
  "IVV",
  "FLOT",
  "QQQ",
  "BNDX",
  "FNDF",
  "IEFA",
  "CASH",
  "ETH",
  "BTC",
  "QQQM",
  "BSV",
  "BND",
  "SIVR",
  "GLDM",
  "VTV",
];

const ticker = v.lazy((x) => {
  if (!x) return $req;
  return v.pipe(
    v.string(),
    v.toUpperCase(),
    v.picklist(tickers, "invalid ticker")
  );
});

const rebalance_tx_raw = v.object({
  tx_id: $req,
  in_id: ticker,
  out_id: ticker,
  in_qty: $num_gt0_fn({ required: true }),
  out_qty: $num_gt0_fn({ required: true }),
  price: $num_gt0_fn({ required: true }),
  fee: $num_gt0_fn(),
});

// form values — $num_gt0_fn transforms to string
export interface IRebalanceTx extends v.InferOutput<typeof rebalance_tx_raw> {}

// db-facing — numeric fields are numbers after coercion
type NumKeys = "in_qty" | "out_qty" | "price" | "fee";
export interface IRebalanceTxDb extends Omit<IRebalanceTx, NumKeys> {
  in_qty: number;
  out_qty: number;
  price: number;
  fee: number;
}

const rebalance_tx = v.pipe(
  rebalance_tx_raw,
  v.forward(
    v.partialCheck(
      [["in_id"], ["out_id"]],
      (x) => x.out_id !== x.in_id,
      "tickers must be different"
    ),
    ["out_id"]
  ),
  v.forward(
    v.partialCheck(
      [["in_id"], ["out_id"]],
      (x) => [x.in_id, x.out_id].includes("CASH"),
      "one of in/out must be cash"
    ),
    ["in_id"]
  )
);

/** internal */
const bals = v.record(ticker, v.number());
export interface IBals extends v.InferOutput<typeof bals> {}

const rebalance_log_raw = v.object({
  txs: v.pipe(v.array(rebalance_tx), v.minLength(1, "at least one tx")),
  /** internal */
  bals: v.record(v.string(), v.number()),
});

export const ticker_nets = (bals: IBals, txs: IRebalanceTx[]) => {
  const a: { [ticker: string]: number } = {};
  for (const tx of txs) {
    //init from bals
    a[tx.out_id] ??= bals[tx.out_id];
    a[tx.in_id] ??= bals[tx.in_id];

    a[tx.out_id] -= +tx.out_qty;
    a[tx.in_id] += +tx.in_qty;
  }
  return a;
};

export const rebalance_log = v.pipe(
  rebalance_log_raw,
  v.forward(
    v.partialCheck(
      [["txs"], ["bals"]],
      (x) => {
        //calculate total reduction from bals
        const n = ticker_nets(x.bals, x.txs);
        return Object.entries(n).every(([, net]) => net >= 0);
      },
      "tickers must have non-negative balance"
    ),
    ["txs"]
  )
);

export interface IRebalancePayload
  extends v.InferOutput<typeof rebalance_log> {}

export interface IRebalanceLog extends IRebalancePayload {
  id: string;
  date: string;
}

export interface IRebalanceLogDb extends Omit<IRebalanceLog, "txs"> {
  txs: IRebalanceTxDb[];
}

const npo_series_ranges = ["week", "month", "quarter", "year"] as const;
const npo_series_range = v.picklist(
  npo_series_ranges,
  "invalid npo series range"
);

export const npo_series_opts = v.object({
  range: v.optional(npo_series_range),
});

export interface INpoSeriesOpts extends v.InferOutput<typeof npo_series_opts> {}

export const dividend_log_fv = v.object({
  date: iso_date(endOfDay, "required"),
  total: $num_gt0_fn({ required: true }),
  ticker,
});

export interface IDividendLogFv extends v.InferOutput<typeof dividend_log_fv> {}
