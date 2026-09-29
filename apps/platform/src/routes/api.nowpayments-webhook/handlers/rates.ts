import { tokens_map } from "@better-giving/crypto";
import type { NP } from "@/nowpayments/types";
import { np } from "$/kit/nowpayments";
import type { SettleRates } from "./payment";

/**
 * usdc on any chain is a dollar. the estimate quotes nowpayments' own
 * conversion, spread included, so it prices usdc away from 1. usdc.e (bridged)
 * carries its own symbol and keeps the estimate.
 */
const usdpu_of = async (code: string): Promise<number> =>
  tokens_map[code.toUpperCase()]?.symbol === "USDC"
    ? 1
    : (await np.estimate(code)).usdpu;

/** a missing fee-currency rate is `null`, not a throw: the fee alone shouldn't hold a settle */
export async function settle_rates(
  payment: NP.PaymentPayload
): Promise<SettleRates> {
  const outcome_usdpu = await usdpu_of(payment.outcome_currency);
  const fee_currency = payment.fee?.currency;
  if (
    !fee_currency ||
    fee_currency.toLowerCase() === payment.outcome_currency.toLowerCase()
  ) {
    return { outcome_usdpu, fee_usdpu: outcome_usdpu };
  }
  const fee_usdpu = await usdpu_of(fee_currency).catch(() => null);
  return { outcome_usdpu, fee_usdpu };
}
