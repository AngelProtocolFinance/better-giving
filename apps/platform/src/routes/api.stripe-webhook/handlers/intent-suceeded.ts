import { fromUnixTime } from "date-fns";
import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import {
  calc_donation_settle,
  type IDonationSettled,
  type ISettlement,
  is_reversed,
  type SettleInputs,
  settle_msgs,
} from "@/donations";
import { report_error } from "@/errors/report";
import type { IMetadata } from "@/stripe";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { db } from "$/pg/db";
import {
  donation_by_sttl_id,
  donation_put,
  donation_update,
} from "$/pg/queries/donation";
import { payment_method } from "../helpers/payment-method";
import { settled_fn } from "../helpers/settled";

export async function handle_intent_succeeded({
  object: intent,
}: Stripe.PaymentIntentSucceededEvent.Data) {
  // the PaymentIntent event has no expandable field, so the PaymentMethod is queried for
  // fetch settled amount and fee
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
    // donation_update inside the tx acquires a row-level write lock on the
    // order row. it does not decide anything on its own — the branch below
    // reads prior.settlement, which a redelivery always finds set — but it is
    // what serializes concurrent deliveries so the guard that follows reads a
    // committed settlement instead of racing on a stale snapshot.
    const prior = await donation_update(tx, inv_ctx.order_id, { via });

    // stripe delivers at-least-once — it retries on the 503 this route answers
    // while a balance txn is still settling, and an operator can redeliver by
    // hand. the settlement carries the intent id, so an existing one is the
    // record that this charge was already settled. without this the rebill
    // branch mints a second donation on every redelivery, and with it a second
    // dist, npo credit, payout and receipt.
    const settled = await donation_by_sttl_id(settlement.id, tx);
    if (settled) {
      // the write is done, but the enqueue below is not part of it: a qstash
      // 5xx or a function timeout between the commit and the loop leaves a
      // settled donation with no dist row, no npo credit, no payout and no
      // receipt. the redelivery is the only thing left that can send them, so
      // it recomputes them rather than bailing. a duplicate costs nothing —
      // dist is absorbed by unique(donation_id,to_id), the match event by its
      // unique donation_id, the receipt by its send claim.
      //
      // unless a refund reversed it in the meantime: the settle path below
      // refuses to write over a reversed donation, and recomputing its msgs
      // here would walk around that guard — a dist and a receipt for money the
      // donor already got back. `settled` is the row this charge actually
      // settled (the clone on a rebill), so its own status is the one that
      // decides.
      if (is_reversed(settled.status)) return null;

      // the settlement living on the order row means this was the charge that
      // opened the donation; on any other row it is a rebill clone, which is
      // excluded from employer matching.
      const row = settled as IDonationSettled;
      return {
        row,
        msgs: settle_msgs(row, { match: row.id === inv_ctx.order_id }),
        recovered: true,
      };
    }

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
    // the donation this intent would settle was already reversed by a refund
    if (result.op === "noop") return null;

    const row =
      result.op === "update"
        ? await donation_update(tx, result.order_id, result.patch)
        : await donation_put(tx, result.row);
    return { row, msgs: result.msgs, recovered: false };
  });

  // an event landing on a donation a refund already reversed. nothing is
  // written and nothing is queued, and route.ts still answers 200 — stripe
  // keeps redelivering anything else. worth seeing: money cleared at stripe
  // against a donation we consider returned.
  if (!written) {
    report_error(
      new Error(`settle event on a reversed donation: ${intent.id}`),
      { order_id: inv_ctx.order_id, intent_id: intent.id }
    );
    return { id: inv_ctx.order_id };
  }

  await enqueue(...written.msgs);

  if (written.recovered) {
    // the settle itself is fine — this reports that a delivery landed on an
    // intent an earlier one had already settled, so the msgs were recomputed
    // and handed to qstash a second time.
    //
    // handed over, not necessarily delivered: `enqueue` dedupes on a key
    // derived from the donation id, and qstash drops a repeat inside its ~10
    // minute window. that drop is the right outcome — a recovery that fast
    // means the first enqueue landed and only the handler failed, so qstash
    // already holds the message. past the window they go out again and the
    // duplicates are absorbed downstream. so this says what was recomputed,
    // not what was sent.
    report_error(
      new Error(`settle redelivered for already-settled intent: ${intent.id}`),
      { donation_id: written.row.id, intent_id: intent.id }
    );
    return { id: written.row.id };
  }

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
