import {
  APP_NAME,
  type donation_receipt,
  type IAmount,
  type IDonor,
} from "emails";
import type { IDonation } from "../donations/interfaces";
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

/** a recipient's display fields; who is on the receipt is the recipient id set */
export interface IRecipient {
  id: number;
  name: string;
  receipt_msg?: string | null;
}

export interface IReceiptCtx {
  from: IDonor;
  tax_receipt_id?: string;
  /** the npo id better giving receives gifts under */
  bg_npo_id: number;
}

type TReceiptDon = Pick<
  IDonation,
  | "id"
  | "to_id"
  | "to_name"
  | "to_type"
  | "created_at"
  | "amount"
  | "upusd"
  | "currency"
  | "program"
>;

/**
 * `whole - part` in the units each figure prints in. printing truncates, so
 * the base, the tip and the fee coverage printed apart can sum a unit short of
 * the total printed whole; taking each as a remainder keeps the rows adding up
 * to it.
 */
const to_remainder = (
  whole: IAmount,
  part: IAmount,
  scale: number
): IAmount => ({
  value:
    (Math.round(whole.value * scale) - Math.round(part.value * scale)) / scale,
  currency: whole.currency,
  value_usd:
    (Math.round(whole.value_usd * 100) - Math.round(part.value_usd * 100)) /
    100,
});

/**
 * the gift's one receipt: a line per recipient splitting the base, then the tip
 * and the fee coverage, totalling what was charged
 */
export const to_receipt = (
  d: TReceiptDon,
  recipient_ids: number[],
  npos: IRecipient[],
  ctx: IReceiptCtx
): donation_receipt.IData => {
  if (recipient_ids.length === 0)
    throw new Error(`no recipients for donation ${d.id}`);
  const by_id = new Map(npos.map((n) => [n.id, n]));
  // the first recipient takes the leftover unit, so the order can't be the query's
  const recipients = [...recipient_ids]
    .sort((a, b) => a - b)
    .map((id) => {
      const npo = by_id.get(id);
      if (!npo) throw new Error(`NPO not found: ${id}`);
      return npo;
    });
  const is_bg = d.to_type === "npo" && +d.to_id === ctx.bg_npo_id;
  const to_name = is_bg ? APP_NAME : d.to_name;
  const { base, tip, fee_allowance } = d.amount;
  const shares = to_amount_shares(
    base,
    base / d.upusd,
    d.currency,
    recipients.length
  );
  const lines: donation_receipt.IReceiptLine[] = recipients.map((npo, i) => ({
    kind: "beneficiary",
    // the name the gift was made to; a fund saves none per member
    name: d.to_type === "npo" ? to_name : npo.name,
    amount: shares[i]!,
    msg: npo.receipt_msg ?? undefined,
    program: d.program?.name,
  }));
  // each payment line is its running total printed less the one before it, so
  // the last one takes the remainder and the rows sum to the printed total
  const printed = (x: number) => to_amount(x, x / d.upusd, d.currency);
  let paid = base;
  for (const [kind, part] of [
    ["tip", tip],
    ["fee", fee_allowance],
  ] as const) {
    if (part <= 0) continue;
    const upto = paid + part;
    lines.push({
      kind,
      name: APP_NAME,
      amount: to_remainder(
        printed(upto),
        printed(paid),
        10 ** vdec(usdpu(upto, upto / d.upusd))
      ),
    });
    paid = upto;
  }
  const total = printed(paid);

  return {
    id: d.id,
    date: to_pretty_utc(d.created_at),
    amount: total,
    to_name,
    is_bg,
    is_fund: d.to_type === "fund",
    tax_receipt_id: ctx.tax_receipt_id,
    from: ctx.from,
    lines,
  };
};
