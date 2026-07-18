import type { IAmount } from "emails";
import { rd_vdec, rd2num, usdpu } from "./decimal/utils";

export const to_amount = (
  amount: number,
  amount_usd: number,
  denom: string
): IAmount => {
  return {
    value: +rd_vdec(amount, usdpu(amount, amount_usd)),
    currency: denom,
    value_usd: rd2num(amount_usd),
  };
};
