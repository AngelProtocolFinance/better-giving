import { stripe } from "$/kit/stripe";
import { donation_by_sttl_id, donation_get } from "$/pg/queries/donation";

/** the donation a charge settled. a subscription charge settled a rebill
 * clone, not the order its invoice names, and its intent carries no metadata;
 * the settlement id is the intent id on every row either kind settles */
export async function refunded_donation(intent_id: string) {
  const settled = await donation_by_sttl_id(intent_id);
  if (settled) return settled;
  const intent = await stripe.paymentIntents.retrieve(intent_id);
  const { order_id } = intent.metadata;
  if (!order_id) throw new Error(`no donation settled by intent: ${intent_id}`);
  const don = await donation_get(order_id);
  if (!don) throw new Error(`donation not found: ${order_id}`);
  return don;
}
