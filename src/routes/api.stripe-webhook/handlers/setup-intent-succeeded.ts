import type Stripe from "stripe";
import { str_id, to_atomic_c } from "#/helpers/stripe";
import { amnt_sum } from "@/donations/helpers";
import { rd2num } from "@/helpers/decimal";
import type { IMetadata } from "@/stripe";
import { stripe as stripe_env } from "$/env";
import { stripe } from "$/kit/stripe";
import { donation_get } from "$/pg/queries/donation";

const intervals = {
  weekly: "week",
  monthly: "month",
  annual: "year",
} as const;

export async function handle_setup_intent_succeeded({
  object: intent,
}: Stripe.SetupIntentSucceededEvent.Data) {
  const { order_id } = intent.metadata as IMetadata;

  const order = await donation_get(order_id);
  if (!order) throw new Error(`Order ${order_id} not found`);

  if (order.frequency === "one-time") {
    throw new Error("should not create subscription for one-time donation");
  }

  const interval = intervals[order.frequency];
  const c = order.currency.toLowerCase();

  const { id: price_id } = await stripe.prices.create({
    active: true,
    billing_scheme: "per_unit",
    currency: order.currency.toLowerCase(),
    product: stripe_env.subs_product_id,
    recurring: {
      interval,
      interval_count: 1,
    },
    unit_amount: to_atomic_c(c)(1),
  });

  const cust_id = str_id(intent.customer);
  const to_pay = amnt_sum(order.amount);

  const { id: subs_id } = await stripe.subscriptions.create({
    customer: cust_id,
    default_payment_method: str_id(intent.payment_method),
    currency: c,
    items: [{ price: price_id, quantity: rd2num(to_pay, 0) }],
    metadata: { order_id: order.id } satisfies IMetadata,
    off_session: true,
  });

  console.info(`Created subscription ${subs_id} for setup intent ${intent.id}`);
}
