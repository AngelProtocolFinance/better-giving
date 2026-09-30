import type { IAmount } from "@/donations";
import { rd } from "@/helpers/decimal";

/** what paypal is asked for: each line truncated to the currency's scale */
export interface ICharge {
  /** the lines in integer minor units */
  minor: { base: number; tip: number; fee_allowance: number };
  /** the same lines in major units, as the donation row records them */
  amount: IAmount;
  /** Σ lines as the decimal string paypal is sent */
  total: string;
  /** the currency's decimal places */
  scale: 0 | 2;
}

/** a line truncated to the currency's scale, in integer minor units */
const to_minor = (amount: number, d: number): number =>
  Number(rd(amount, d).replace(".", ""));

export const fmt_minor = (minor: number, d: number): string => {
  if (d === 0) return `${minor}`;
  const digits = `${minor}`.padStart(d + 1, "0");
  return `${digits.slice(0, -d)}.${digits.slice(-d)}`;
};

export const paypal_charge = (a: IAmount, scale: 0 | 2): ICharge => {
  const minor = {
    base: to_minor(a.base, scale),
    tip: to_minor(a.tip, scale),
    fee_allowance: to_minor(a.fee_allowance, scale),
  };
  const major = (m: number) => Number(fmt_minor(m, scale));
  return {
    minor,
    amount: {
      base: major(minor.base),
      tip: major(minor.tip),
      fee_allowance: major(minor.fee_allowance),
    },
    // summed in minor units so it equals Σ lines by construction: paypal
    // rejects an order whose item_total differs from the sum of its items
    total: fmt_minor(minor.base + minor.tip + minor.fee_allowance, scale),
    scale,
  };
};
