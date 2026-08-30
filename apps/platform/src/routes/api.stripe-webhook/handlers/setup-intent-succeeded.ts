import type Stripe from "stripe";
import { str_id, to_atomic_c } from "#/helpers/stripe";
import { amnt_sum } from "@/donations/helpers";
import { rd2num } from "@/helpers/decimal";
import type { IMetadata } from "@/stripe";
import { stripe as stripe_env } from "$/env";
import { stripe } from "$/kit/stripe";
import { db } from "$/pg/db";
import { donation_get, donation_update } from "$/pg/queries/donation";
import { sub_put } from "$/pg/queries/subscription";
import { to_sub_record } from "./subscription-created";

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

  // stripe prunes idempotency keys once they are 24h old, so a hand-redelivered
  // event older than that would write again. the order row outlives the key and
  // is what stops a donor ending up on two live subscriptions long after.
  if (order.subscription_id) {
    console.info(
      `subscription ${order.subscription_id} already exists for order ${order.id}`
    );
    return;
  }

  const interval = intervals[order.frequency];
  const c = order.currency.toLowerCase();

  // both writes are keyed off the setup intent, which is the same on every
  // redelivery of this event: stripe replays the saved first result instead of
  // creating a second object. the price is keyed too — a second one would be
  // the price the second subscription bills on.
  const { id: price_id } = await stripe.prices.create(
    {
      active: true,
      billing_scheme: "per_unit",
      currency: order.currency.toLowerCase(),
      product: stripe_env.subs_product_id,
      recurring: {
        interval,
        interval_count: 1,
      },
      unit_amount: to_atomic_c(c)(1),
    },
    { idempotencyKey: `price_${intent.id}` }
  );

  const cust_id = str_id(intent.customer);
  const to_pay = amnt_sum(order.amount);

  const sub = await stripe.subscriptions.create(
    {
      // the mode is fixed for the life of the subscription and only ever
      // migrates classic -> flexible, never back. spelled out so the default
      // an api version carries cannot pick it. for a fixed-price single item
      // with no trial, discount, or update, the two modes bill identically;
      // older subscriptions in the fleet are still classic and stay that way.
      billing_mode: { type: "flexible" },
      customer: cust_id,
      default_payment_method: str_id(intent.payment_method),
      currency: c,
      items: [{ price: price_id, quantity: rd2num(to_pay, 0) }],
      metadata: { order_id: order.id } satisfies IMetadata,
      off_session: true,
    },
    { idempotencyKey: `subs_${intent.id}` }
  );

  // the guard above is only durable if something writes the subscription onto
  // the order row, and until this nothing did so before the first invoice
  // settled — days away for a us_bank_account donor, long past the 24h
  // idempotency window.
  //
  // the subscriptions row has to go down first: donations.subscription_id is a
  // foreign key into it. `customer.subscription.created` writes the same row
  // from the same object and is a separate delivery with no ordering guarantee
  // against this one, so `sub_put` is a no-op for whichever lands second.
  //
  // one transaction because half of this pair is worse than neither: a
  // subscriptions row nothing points at is a live stripe subscription the
  // order row does not know about, so the guard above reads "no subscription
  // yet" and the next redelivery puts the donor on a second one.
  await db.transaction(async (tx) => {
    await sub_put(tx, to_sub_record(sub, order));
    await donation_update(tx, order.id, { subscription_id: sub.id });
  });

  console.info(`Created subscription ${sub.id} for setup intent ${intent.id}`);
}
