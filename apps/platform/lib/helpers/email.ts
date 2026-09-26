import type { donation_receipt, IAmount, IDonor } from "emails";
import type { IDonation } from "../donations/interfaces";
import { is_funded_member } from "../settlement/funded-members";
import { to_pretty_utc } from "./date";
import { rd_vdec, rd2num, usdpu, vdec } from "./decimal/utils";

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

/** `units` split `n` ways, one leftover unit each to the first shares */
const split_units = (units: number, n: number): number[] => {
  const each = Math.floor(units / n);
  const leftover = units - each * n;
  return Array.from({ length: n }, (_, i) => each + (i < leftover ? 1 : 0));
};

/**
 * `to_amount(amount, amount_usd, denom)` split `n` ways: the token value and
 * the usd value each split in the smallest unit it prints, so both printed
 * figures sum to what the whole prints. the usd figure is split on its own —
 * derived from a token share, it moves by a whole token quantum (0.01 btc).
 */
export const to_amount_shares = (
  amount: number,
  amount_usd: number,
  denom: string,
  n: number
): IAmount[] => {
  const whole = to_amount(amount, amount_usd, denom);
  const scale = 10 ** vdec(usdpu(amount, amount_usd));
  // rounded, not truncated: a printed value scaled to its units can land a
  // hair either side of the integer (1.1 * 100 is 110.00000000000001)
  const values = split_units(Math.round(whole.value * scale), n);
  const cents = split_units(Math.round(whole.value_usd * 100), n);

  return values.map((v, i) => ({
    value: v / scale,
    currency: denom,
    value_usd: cents[i]! / 100,
  }));
};

export interface IFundMember {
  id: number;
  name: string;
  active?: boolean;
  receipt_msg?: string | null;
}

export interface IFundReceiptCtx {
  from: IDonor;
  tax_receipt_id?: string;
  /** the npo id better giving receives gifts under */
  bg_npo_id: number;
}

type TFundDon = Pick<
  IDonation,
  "id" | "to_id" | "created_at" | "amount" | "upusd" | "currency"
>;

/** one receipt per member the settlement pays, splitting the gift's base */
export const to_fund_receipts = (
  d: TFundDon,
  members: IFundMember[],
  ctx: IFundReceiptCtx
): donation_receipt.IData[] => {
  // the first member takes the leftover unit, so the order can't be the query's
  const funded = members.filter(is_funded_member).sort((a, b) => a.id - b.id);
  if (funded.length === 0)
    throw new Error(`Fund has no funded members: ${d.to_id}`);
  const { base } = d.amount;
  const amounts = to_amount_shares(
    base,
    base / d.upusd,
    d.currency,
    funded.length
  );

  return funded.map((npo, i) => ({
    id: d.id,
    date: to_pretty_utc(d.created_at),
    amount: amounts[i]!,
    to_name: npo.name,
    is_bg: npo.id === ctx.bg_npo_id,
    tax_receipt_id: ctx.tax_receipt_id,
    to_msg_to_from: npo.receipt_msg ?? undefined,
    from: ctx.from,
  }));
};
