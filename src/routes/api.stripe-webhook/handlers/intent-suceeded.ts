import { fromUnixTime } from "date-fns";
import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import type { IDonation, IDonationSettled, ISettlement } from "@/donations";
import * as don_sttl_dist from "@/queue/msgs/don-sttl-dist";
import * as don_sttl_receipt from "@/queue/msgs/don-sttl-receipt";
import type { IMetadata } from "@/stripe";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { db } from "$/pg/db";
import { donation_put, donation_update } from "$/pg/queries/donation";
import { payment_method } from "../helpers/payment-method";
import { settled_fn } from "../helpers/settled";

export async function handle_intent_succeeded({
  object: intent,
}: Stripe.PaymentIntentSucceededEvent.Data) {
  //PaymentIntent Event does not have expandable field so we query for PaymentMethod
  // Fetch settled amount and fee
  const [{ fee, net }, pm] = await Promise.all([
    settled_fn(intent.id),
    payment_method(str_id(intent.payment_method)),
  ]);

  const settled: ISettlement = {
    date: fromUnixTime(intent.created).toISOString(),
    fee,
    net,
    currency: "USD",
    id: intent.id,
  };

  if (is_onetime(intent.metadata)) {
    const { order_id } = intent.metadata;

    const don = await db.transaction(async (tx) => {
      return donation_update(tx, order_id, {
        status: "settled",
        settlement: settled,
        via: `stripe:${pm}`,
      });
    });
    await enqueue(
      don_sttl_dist.to_msg(don as IDonationSettled),
      don_sttl_receipt.to_msg(don)
    );

    console.info(`donation settled: ${don.id}`);
    return { id: don.id };
  }

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

  const p = await db.transaction(async (tx) => {
    const don = await donation_update(tx, order_id, {
      via: `stripe:${pm}`,
    });

    if (!don.settlement) {
      // first settlement
      return donation_update(tx, order_id, {
        status: "settled",
        settlement: settled,
        subscription_id: subs_id,
      });
    }

    // recurring rebill — persist a new donation record
    const created_at = fromUnixTime(inv.created).toISOString();
    const rebill: IDonation = {
      ...don,
      id: crypto.randomUUID(),
      id_v1: undefined,
      created_at,
      updated_at: created_at,
      settlement: settled,
      subscription_id: subs_id,
    };
    return donation_put(tx, rebill);
  });
  await enqueue(
    don_sttl_dist.to_msg(p as IDonationSettled),
    don_sttl_receipt.to_msg(p)
  );

  console.info(`donation settled: ${p.id}`);
}

function is_onetime(metadata: any): metadata is IMetadata {
  return Object.keys(metadata).length > 0;
}
