import type { IDistFees } from "@/types/donation";
import type { IParts } from "@/types/donation-dist";

/** @returns [resulting balance, excess fa ] */
export const credit_fa = (
  amount: number,
  { fa, pf }: { fa: number; pf: number }
) => {
  return [fa ? amount + pf : amount, fa ? fa - pf : 0];
};

/** @returns resulting balance after debiting fees and the actual fee amount */
export const debit_pcfs = (
  amount: number,
  fees: IDistFees
): [number, IDistFees] => {
  const base = amount * fees.base;
  const fsa = amount * fees.fsa;
  return [amount - base - fsa, { base, fsa }];
};

export const shared = (obj: IParts, n: number): IParts => ({
  amnt: {
    base: obj.amnt.base / n,
    tip: obj.amnt.tip / n,
    fee_allowance: obj.amnt.fee_allowance / n,
  },
  amnt_usd: {
    base: obj.amnt_usd.base / n,
    tip: obj.amnt_usd.tip / n,
    fee_allowance: obj.amnt_usd.fee_allowance / n,
  },
  fa: {
    base: obj.fa.base / n,
    tip: obj.fa.tip / n,
    fee_allowance: obj.fa.fee_allowance / n,
  },
  sttl: {
    base: obj.sttl.base / n,
    tip: obj.sttl.tip / n,
    fee_allowance: obj.sttl.fee_allowance / n,
  },
  sttl_fee: {
    base: obj.sttl_fee.base / n,
    tip: obj.sttl_fee.tip / n,
    fee_allowance: obj.sttl_fee.fee_allowance / n,
  },
  sttl_fa: {
    base: obj.sttl_fa.base / n,
    tip: obj.sttl_fa.tip / n,
    fee_allowance: obj.sttl_fa.fee_allowance / n,
  },
});
