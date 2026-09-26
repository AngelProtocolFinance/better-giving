import type { IAmount } from "emails";
import { rd_vdec, rd2num, usdpu, vdec } from "./decimal/utils";

/**
 * `amount` split `n` ways as receipt amounts whose printed values sum to what
 * `to_amount(amount, …)` prints for the whole: split in the smallest unit that
 * prints for this currency, one leftover unit each to the first shares.
 */
export const to_amount_shares = (
  amount: number,
  n: number,
  upusd: number,
  denom: string
): IAmount[] => {
  const usd_per_unit = usdpu(amount, amount / upusd);
  const scale = 10 ** vdec(usd_per_unit);
  // rounded, not truncated: the printed total is exact in decimal but not in
  // binary (0.29 * 100 is 28.999…)
  const units = Math.round(+rd_vdec(amount, usd_per_unit) * scale);
  const each = Math.floor(units / n);
  const leftover = units - each * n;

  return Array.from({ length: n }, (_, i) => {
    const value = (each + (i < leftover ? 1 : 0)) / scale;
    return { value, currency: denom, value_usd: rd2num(value / upusd) };
  });
};
