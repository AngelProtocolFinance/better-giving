import type Stripe from "stripe";

/** a refund stripe won't send: no money moved and none will */
export const is_failed_or_canceled = (r: Stripe.Refund) =>
  r.status === "failed" || r.status === "canceled";

/** a refund as the refund core takes it: its own amount, and its time at
 * stripe */
export const refund_take = (
  r: Pick<Stripe.Refund, "id" | "amount" | "created">
) => ({
  id: r.id,
  amount: r.amount,
  ...(Number.isFinite(r.created) && {
    created_at: new Date(r.created * 1000).toISOString(),
  }),
});

/** live refunds stripe hasn't sent yet: any one can still fail, so a
 * reversal waits until none is left */
export const unsent_refunds = (refunds: Stripe.Refund[]) =>
  refunds.filter((r) => !is_failed_or_canceled(r) && r.status !== "succeeded");
