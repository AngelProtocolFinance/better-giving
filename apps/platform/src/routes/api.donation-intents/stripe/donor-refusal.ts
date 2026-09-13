import Stripe from "stripe";

const ABOVE_LIMIT =
  "This amount is above the limit for this payment method. Try a smaller amount or a different payment method.";
const BELOW_MIN =
  "This amount is below the minimum for this payment method. Try a larger amount or a different payment method.";

/** stripe error codes the donor can act on, from docs.stripe.com/error-codes */
const reasons: Record<string, string> = {
  amount_too_large: ABOVE_LIMIT,
  // a rail's per-payment cap ("does not support payment amounts greater than … for the type acss_debit")
  charge_exceeds_transaction_limit: ABOVE_LIMIT,
  amount_too_small: BELOW_MIN,
};

export interface IDonorRefusal {
  /** safe to show the donor verbatim */
  reason: string;
  code: string;
  /** stripe's own wording — account internals, server logs only */
  message: string;
}

/** undefined when the error isn't the donor's to fix */
export const donor_refusal = (err: unknown): IDonorRefusal | undefined => {
  if (!(err instanceof Stripe.errors.StripeError) || !err.code) return;
  const reason = reasons[err.code];
  if (!reason) return;
  return { reason, code: err.code, message: err.message };
};
