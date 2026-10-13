import Stripe from "stripe";

/**
 * stripe answered and said no: a revoked or unpayable account, a charge it
 * won't fund from, a balance that can't cover a reversal. a retry sends the
 * same request under the same idempotency key, which stripe answers the same
 * way, so only a person can move it
 */
export const is_refusal = (
  e: unknown
): e is
  | Stripe.errors.StripeInvalidRequestError
  | Stripe.errors.StripePermissionError =>
  e instanceof Stripe.errors.StripeInvalidRequestError ||
  e instanceof Stripe.errors.StripePermissionError;
