import type Stripe from "stripe";
import { stripe } from "../kit/stripe";

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

/** a charge's refunds as the refund core counts them */
export interface ChargeRefunds {
  charge: Stripe.Charge;
  /** the charge's captured amount, which each refund is a part of */
  of: number;
  /** newest first, as stripe lists them */
  all: Stripe.Refund[];
  /** not failed or canceled, sent or not: what the share counts */
  live: Stripe.Refund[];
  /** live ones stripe hasn't sent, any of which can still fail */
  unsent: Stripe.Refund[];
  /** live ones stripe has sent */
  sent: Stripe.Refund[];
}

/** `charge`'s refunds as stripe has them now. `fresh`, one just retrieved,
 * stands in for its copy in the list. summed off the list, never the
 * charge's own refunded total: stripe doesn't document whether
 * `amount_refunded` counts a pending refund or drops a failed one */
export async function charge_refunds(
  charge: string | Stripe.Charge,
  o: { fresh?: Stripe.Refund } = {}
): Promise<ChargeRefunds> {
  const ch =
    typeof charge === "string" ? await stripe.charges.retrieve(charge) : charge;
  const { data } = await stripe.refunds.list({ charge: ch.id, limit: 100 });
  const { fresh } = o;
  const all = fresh ? [fresh, ...data.filter((r) => r.id !== fresh.id)] : data;
  const live = all.filter((r) => !is_failed_or_canceled(r));
  const unsent = unsent_refunds(all);
  return {
    charge: ch,
    of: ch.amount_captured,
    all,
    live,
    unsent,
    sent: live.filter((r) => !unsent.includes(r)),
  };
}
