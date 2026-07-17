import type { ICurrencyFv } from "#/types/components";
import type { DonateMethodId, TFrequency } from "@/schemas";
import type { ITickerFv, ITokenFv } from "../types";

export const init_token_option: ITokenFv = {
  precision: 6,
  min: 0,
  code: "",
  name: "",
  symbol: "",
  id: "",
  amount: "",
  network: "",
  cg_id: "",
  color: "",
  logo: "",
  usdpu: 1,
};

export const init_ticker_option: ITickerFv = {
  symbol: "",
  amount: "",
  name: "",
  min: 0,
  usdpu: 1,
};

const USD_CODE = "USD";
export const usd_option: ICurrencyFv = { code: USD_CODE, min: 2, rate: 1 };

export const all_method_ids: DonateMethodId[] = [
  "stripe",
  "stripe_bank",
  "daf",
  "stocks",
  "ira_qcd",
  "crypto",
];

export const freqs_default: TFrequency[] = ["one-time", "monthly"];
