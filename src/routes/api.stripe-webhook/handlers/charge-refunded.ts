import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import { stripe } from "$/kit/stripe";
import { dists_for_refund } from "$/pg/queries/dist";
import { donation_get } from "$/pg/queries/donation";
import { process_refund } from "$/refund/process";

export async function handle_charge_refunded({
  object: charge,
}: Stripe.ChargeRefundedEvent.Data) {
  const intent_id = str_id(charge.payment_intent);
  const intent = await stripe.paymentIntents.retrieve(intent_id);
  const { order_id } = intent.metadata;
  if (!order_id)
    throw new Error(`missing order_id in intent metadata: ${intent_id}`);

  const don = await donation_get(order_id);
  if (!don) throw new Error(`donation not found: ${order_id}`);
  if (don.status === "refunded" || don.status === "refunded_loss") {
    console.info(`already refunded: ${order_id}`);
    return;
  }

  const graphs = await dists_for_refund(order_id);
  if (graphs.length === 0) {
    throw new Error(`no settled dists for donation: ${order_id}`);
  }

  const result = await process_refund(order_id, graphs, {
    form_id: don.form_id ?? null,
    program_id: don.program?.id ?? null,
    alert_from: "charge-refunded",
  });

  console.info(
    `charge refunded: ${order_id}, dists: ${graphs.length}, failures: ${result.failures.length}, losses: ${result.loss_msgs.length}`
  );
}
