import type { NP } from "@/nowpayments/types";
import { np } from "$/kit/nowpayments";
import type { SettleRates } from "./payment";

/** a missing fee-currency rate is `null`, not a throw: the fee alone shouldn't hold a settle */
export async function settle_rates(
  payment: NP.PaymentPayload
): Promise<SettleRates> {
  const { usdpu: outcome_usdpu } = await np.estimate(payment.outcome_currency);
  const fee_currency = payment.fee?.currency;
  if (
    !fee_currency ||
    fee_currency.toLowerCase() === payment.outcome_currency.toLowerCase()
  ) {
    return { outcome_usdpu, fee_usdpu: outcome_usdpu };
  }
  const fee_usdpu = await np
    .estimate(fee_currency)
    .then((r) => r.usdpu)
    .catch(() => null);
  return { outcome_usdpu, fee_usdpu };
}
