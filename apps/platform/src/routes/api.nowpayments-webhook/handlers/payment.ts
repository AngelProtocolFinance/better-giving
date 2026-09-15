import { tokens_map } from "@better-giving/crypto";
import type { Alert } from "@/discord";
import type { IAmount, IDonation, ISettlement } from "@/donations";
import { amnt_sum, partition } from "@/donations/helpers";
import type { NP } from "@/nowpayments/types";

/** an alert the caller sends; mapping a payload never sends one itself */
export type Warning = Omit<Alert, "from">;

export interface Mapped<T> {
  value: T;
  warnings: Warning[];
}

/** usd per unit of the outcome currency and of `fee.currency`; `null` when no rate was found */
export interface SettleRates {
  outcome_usdpu: number;
  fee_usdpu: number | null;
}

/** ids and status only — the payload also carries donor wallet and email */
export const ref_of = (p: NP.PaymentPayload): string =>
  `payment:${p.payment_id} order:${p.order_id} status:${p.payment_status}` +
  (p.parent_payment_id != null ? ` parent:${p.parent_payment_id}` : "");

/** the order's tip and fee allowance, proportioned over what actually arrived */
export const paid_amount = (
  payment: NP.PaymentPayload,
  order: Pick<IDonation, "amount">,
  is_sandbox: boolean
): IAmount => {
  // sandbox simulations pay nothing real; credit the order's own amount
  const paid = is_sandbox ? amnt_sum(order.amount) : payment.actually_paid;
  return partition(order.amount)(paid);
};

/**
 * the payment's three fee parts in usd. they are denominated in `fee.currency`,
 * which need not be the outcome currency, so they take that currency's rate.
 */
export function fee_usd(
  payment: NP.PaymentPayload,
  fee_usdpu: number | null
): Mapped<number> {
  // typed non-null, but failed payloads have been seen without one
  const fee: NP.Payment.Fee | null = payment.fee ?? null;
  if (!fee) return { value: 0, warnings: [] };

  const total = fee.depositFee + fee.serviceFee + fee.withdrawalFee;
  if (!total) return { value: 0, warnings: [] };

  if (fee_usdpu != null && Number.isFinite(fee_usdpu) && fee_usdpu > 0) {
    return { value: total * fee_usdpu, warnings: [] };
  }
  return {
    value: 0,
    warnings: [
      {
        title: "Fee recorded as 0: no usd rate for fee currency",
        type: "ERROR",
        body: `${ref_of(payment)} fee:${total} ${fee.currency.toUpperCase()}`,
      },
    ],
  };
}

/**
 * settlement currency is USDC ( set in account), regardless of chain
 * fiat equivalents (actual_paid_amount_fiat) in "usd" set in account
 */
export function to_settlement(
  payment: NP.PaymentPayload,
  rates: SettleRates,
  date: string
): Mapped<ISettlement> {
  const code = payment.outcome_currency.toUpperCase();
  const outcome_token = tokens_map[code];
  const fee = fee_usd(payment, rates.fee_usdpu);
  const warnings: Warning[] = outcome_token
    ? []
    : [
        {
          title: "Outcome currency missing from token map",
          body: `${ref_of(payment)} outcome:${code}`,
        },
      ];

  /** all in usd */
  return {
    value: {
      id: payment.payment_id.toString(),
      date,
      net: payment.outcome_amount * rates.outcome_usdpu,
      fee: fee.value,
      currency: outcome_token?.code ?? code,
    },
    warnings: [...warnings, ...fee.warnings],
  };
}
