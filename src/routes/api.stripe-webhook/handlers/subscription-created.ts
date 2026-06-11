import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import { amnt_sum } from "@/donations/helpers";
import { rd2num } from "@/helpers/decimal";
import type { IMetadata } from "@/stripe";
import type { ISub } from "@/subscriptions";
import { db } from "$/pg/db";
import { donation_get } from "$/pg/queries/donation";
import { sub_put } from "$/pg/queries/subscription";

export async function handle_subscription_created({
  object: sub,
}: Stripe.CustomerSubscriptionCreatedEvent.Data) {
  const { order_id } = sub.metadata as IMetadata;

  const order = await donation_get(order_id);
  if (!order) throw new Error(`Order not found for id:${order_id}`);

  const { price: p } = sub.items.data[0];

  if (!p.recurring) {
    throw new Error(
      `price:${p.id} is not recurring on subscription:${sub.id} price`
    );
  }
  const total = amnt_sum(order.amount);
  const total_usd = total / order.upusd;

  const record: ISub = {
    id: sub.id,
    created_at: new Date(sub.created * 1000).toISOString(),
    updated_at: new Date(sub.created * 1000).toISOString(),
    interval: p.recurring.interval,
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

  await sub_put(db, record);
  console.info(`Created subscription record ${sub.id}`);
}
