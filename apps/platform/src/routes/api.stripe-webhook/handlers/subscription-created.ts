import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import type { IDonation } from "@/donations";
import { amnt_sum } from "@/donations/helpers";
import { rd2num } from "@/helpers/decimal";
import type { IMetadata } from "@/stripe";
import type { ISub, TInterval } from "@/subscriptions";
import { db } from "$/pg/db";
import { donation_get } from "$/pg/queries/donation";
import { sub_put } from "$/pg/queries/subscription";

const INTERVALS: Record<TInterval, true> = {
  day: true,
  week: true,
  month: true,
  year: true,
};

const is_interval = (s: Stripe.Price.Recurring.Interval): s is TInterval =>
  s in INTERVALS;

/**
 * project a stripe subscription + the order it came from into our row.
 *
 * shared with the setup-intent handler, which creates the subscription and so
 * holds the same object this event carries. two definitions would let the row
 * this event writes and the row that handler writes disagree, and `sub_put` is
 * a no-op for whichever of them lands second.
 */
export function to_sub_record(
  sub: Stripe.Subscription,
  order: IDonation
): ISub {
  const { price: p } = sub.items.data[0];

  if (!p.recurring) {
    throw new Error(
      `price:${p.id} is not recurring on subscription:${sub.id} price`
    );
  }
  const { interval } = p.recurring;
  if (!is_interval(interval)) {
    throw new Error(
      `price:${p.id} on subscription:${sub.id} recurs at unsupported interval:${interval}`
    );
  }

  const total = amnt_sum(order.amount);
  const total_usd = total / order.upusd;

  return {
    id: sub.id,
    created_at: new Date(sub.created * 1000).toISOString(),
    updated_at: new Date(sub.created * 1000).toISOString(),
    interval,
    interval_count: p.recurring.interval_count,
    next_billing: new Date(
      sub.items.data[0].current_period_end * 1000
    ).toISOString(),
    amount: rd2num(total, 0),
    amount_usd: rd2num(total_usd, 0),
    currency: order.currency,
    product_id: str_id(p.product),
    to_npo_id: order.to_type === "npo" ? Number(order.to_id) : null,
    to_fund_id: order.to_type === "fund" ? order.to_id : null,
    to_name: order.to_name,
    platform: "stripe",
    status: "active",
    from_id: order.from_email,
  };
}

export async function handle_subscription_created({
  object: sub,
}: Stripe.CustomerSubscriptionCreatedEvent.Data) {
  const { order_id } = sub.metadata as IMetadata;

  const order = await donation_get(order_id);
  if (!order) throw new Error(`Order not found for id:${order_id}`);

  await sub_put(db, to_sub_record(sub, order));
  console.info(`Created subscription record ${sub.id}`);
}
