import { fromUnixTime } from "date-fns";
import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import {
  calc_donation_settle,
  type IDonationSettled,
  type ISettlement,
  type SettleInputs,
} from "@/donations";
import type { IMetadata } from "@/stripe";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { db } from "$/pg/db";
import {
  donation_get,
  donation_put,
  donation_update,
} from "$/pg/queries/donation";
import { payment_method } from "../helpers/payment-method";
import { settled_fn } from "../helpers/settled";

export async function handle_intent_succeeded({
  object: intent,
}: Stripe.PaymentIntentSucceededEvent.Data) {
  // PaymentIntent Event does not have expandable field so we query for PaymentMethod
  // Fetch settled amount and fee
  const [{ fee, net }, pm] = await Promise.all([
    settled_fn(intent.id),
    payment_method(str_id(intent.payment_method)),
  ]);

  const settlement: ISettlement = {
    date: fromUnixTime(intent.created).toISOString(),
    fee,
    net,
    currency: "USD",
    id: intent.id,
  };
  const via = `stripe:${pm}`;

  const inputs = await project_inputs(intent, settlement, via);
  const result = calc_donation_settle(inputs);

  const written =
    result.op === "update"
      ? await db.transaction((tx) =>
          donation_update(tx, result.order_id, result.patch)
        )
      : await db.transaction((tx) => donation_put(tx, result.row));

  await enqueue(...result.msgs);
  console.info(`donation settled: ${written.id}`);
  return { id: written.id };
}

async function project_inputs(
  intent: Stripe.PaymentIntent,
  settlement: ISettlement,
  via: string
): Promise<SettleInputs> {
  if (is_onetime(intent.metadata)) {
    const { order_id } = intent.metadata;
    const prior = await donation_get(order_id);
    if (!prior) throw `donation not found: ${order_id}`;
    return { kind: "one-time", order_id, prior, settlement, via };
  }

  // subscription intent — metadata empty, must come from invoice
  const { data: ips } = await stripe.invoicePayments.list({
    payment: { payment_intent: intent.id, type: "payment_intent" },
    expand: ["data.invoice"],
  });
  const inv = ips[0]?.invoice;
  if (!inv || typeof inv === "string" || inv.deleted)
    throw "missing invoice for intent";

  const subs_details = inv.parent?.subscription_details;
  if (!subs_details?.metadata) throw "missing subs metadata";
  const { order_id } = subs_details.metadata;
  const subs_id =
    typeof subs_details.subscription === "string"
      ? subs_details.subscription
      : subs_details.subscription?.id;
  if (!subs_id) throw "missing subscription id on recurring invoice";

  const prior = await donation_get(order_id);
  if (!prior) throw `donation not found: ${order_id}`;

  if (!prior.settlement) {
    return {
      kind: "first-recurring",
      order_id,
      prior,
      settlement,
      subs_id,
      via,
    };
  }
  return {
    kind: "rebill",
    order_id,
    prior: prior as IDonationSettled,
    settlement: {
      ...settlement,
      date: fromUnixTime(inv.created).toISOString(),
    },
    subs_id,
    via,
    new_id: crypto.randomUUID(),
  };
}

function is_onetime(metadata: any): metadata is IMetadata {
  return Object.keys(metadata).length > 0;
}
