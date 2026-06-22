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
import { donation_put, donation_update } from "$/pg/queries/donation";
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

  const inv_ctx = is_onetime(intent.metadata)
    ? {
        order_id: intent.metadata.order_id,
        subs_id: null,
        date: settlement.date,
      }
    : await invoice_ctx(intent.id);

  const written = await db.transaction(async (tx) => {
    // donation_update inside the tx acquires a row-level write lock — concurrent
    // webhook retries serialize on this row, so the first/rebill branch decision
    // sees a committed prior.settlement instead of racing on a stale snapshot.
    const prior = await donation_update(tx, inv_ctx.order_id, { via });

    const inputs: SettleInputs = !inv_ctx.subs_id
      ? { kind: "one-time", order_id: inv_ctx.order_id, prior, settlement, via }
      : !prior.settlement
        ? {
            kind: "first-recurring",
            order_id: inv_ctx.order_id,
            prior,
            settlement: { ...settlement, date: inv_ctx.date },
            subs_id: inv_ctx.subs_id,
            via,
          }
        : {
            kind: "rebill",
            order_id: inv_ctx.order_id,
            prior: prior as IDonationSettled,
            settlement: { ...settlement, date: inv_ctx.date },
            subs_id: inv_ctx.subs_id,
            via,
            new_id: crypto.randomUUID(),
          };

    const result = calc_donation_settle(inputs);
    const row =
      result.op === "update"
        ? await donation_update(tx, result.order_id, result.patch)
        : await donation_put(tx, result.row);
    return { row, msgs: result.msgs };
  });

  await enqueue(...written.msgs);
  console.info(`donation settled: ${written.row.id}`);
  return { id: written.row.id };
}

async function invoice_ctx(intent_id: string) {
  const { data: ips } = await stripe.invoicePayments.list({
    payment: { payment_intent: intent_id, type: "payment_intent" },
    expand: ["data.invoice"],
  });
  const inv = ips[0]?.invoice;
  if (!inv || typeof inv === "string" || inv.deleted)
    throw new Error("missing invoice for intent");

  const subs_details = inv.parent?.subscription_details;
  if (!subs_details?.metadata) throw new Error("missing subs metadata");
  const { order_id } = subs_details.metadata;
  const subs_id =
    typeof subs_details.subscription === "string"
      ? subs_details.subscription
      : subs_details.subscription?.id;
  if (!subs_id) throw new Error("missing subscription id on recurring invoice");

  return { order_id, subs_id, date: fromUnixTime(inv.created).toISOString() };
}

function is_onetime(metadata: any): metadata is IMetadata {
  return Object.keys(metadata).length > 0;
}
