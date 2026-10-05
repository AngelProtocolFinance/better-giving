import Stripe from "stripe";
import { report_error } from "#/errors/report";
import { msg } from "@/queue";
import { FIRST_PAYMENT_INCOMPLETE, type ISubUpdate } from "@/subscriptions";
import { stripe as stripe_env } from "$/env";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { db } from "$/pg/db";
import {
  sub_cancel_reason_default,
  sub_reactivate_if,
  sub_update,
} from "$/pg/queries/subscription";
import type { Route } from "./+types/route";
import {
  handle_charge_refunded,
  handle_dispute_closed,
  handle_dispute_opened,
  handle_intent_failed,
  handle_intent_requires_action,
  handle_refund_failed,
  handle_refund_updated,
  handle_setup_intent_failed,
  handle_setup_intent_succeeded,
} from "./handlers";
import { handle_intent_succeeded } from "./handlers/intent-suceeded";
import {
  handle_subscription_created,
  row_status,
} from "./handlers/subscription-created";
import { ReversalIncompleteError } from "./helpers/reversal-incomplete";
import { BalanceTxnNotReadyError } from "./helpers/settled";

/**
 * ended at stripe, so nothing left to cancel there — or incomplete, which
 * turns active if its first invoice is paid and otherwise expires there on
 * its own after 23h; a cancel would stop stripe collecting that invoice
 */
const NO_CANCEL_TO_QUEUE = new Set<Stripe.Subscription.Status>([
  "canceled",
  "incomplete_expired",
  "incomplete",
]);

/** stripe's reason for ending a sub; an unpaid one carries none until it's canceled */
const stripe_end_reason = (sub: Stripe.Subscription): string | null => {
  const details = sub.cancellation_details;
  const reason =
    details?.reason ?? (sub.status === "unpaid" ? "payment_failed" : null);
  if (!reason) return null;
  return details?.comment ? `${reason}: ${details.comment}` : reason;
};

/** the first reason recorded stays (the donor's, an admin's, or an earlier stripe one) */
const record_end_reason = async (sub: Stripe.Subscription) => {
  const reason = stripe_end_reason(sub);
  if (reason) await sub_cancel_reason_default(db, sub.id, reason);
};

/**
 * webhook signing logic inspired by stripe-node,
 * @see {@link https://github.com/stripe/stripe-node/blob/master/examples/webhook-signing/nextjs/app/api/webhooks/route.ts}
 */
export async function action({ request }: Route.ActionArgs) {
  const signature = request.headers.get("stripe-signature");
  if (!signature)
    return new Response("missing signature header", { status: 403 });

  const body = await request.text();

  try {
    // inside the try: constructEvent throws on a bad signature, and that must
    // land in the catch below (reported + 4xx) instead of escaping as a 500.
    const stripe_event = stripe.webhooks.constructEvent(
      body,
      signature,
      stripe_env.webhook_secret
    );

    switch (stripe_event.type) {
      case "payment_intent.succeeded":
        await handle_intent_succeeded(stripe_event.data);
        break;
      case "setup_intent.succeeded":
        await handle_setup_intent_succeeded(stripe_event.data);
        break;
      case "payment_intent.payment_failed":
        await handle_intent_failed(stripe_event.data);
        break;
      case "setup_intent.setup_failed":
        await handle_setup_intent_failed(stripe_event.data);
        break;
      case "payment_intent.requires_action":
      case "setup_intent.requires_action":
        if (
          stripe_event.data.object.next_action?.type !==
          "verify_with_microdeposits"
        ) {
          return new Response(
            `requires_action next action type not supported: ${stripe_event.type}`,
            { status: 201 }
          );
        }
        await handle_intent_requires_action(stripe_event.data.object);
        break;
      case "customer.subscription.created": {
        await handle_subscription_created(stripe_event.data);
        break;
      }
      case "customer.subscription.updated": {
        // events arrive out of order: a late past_due must not undo a recovery
        const sub = await stripe.subscriptions.retrieve(
          stripe_event.data.object.id
        );
        const period_end = sub.items.data[0]?.current_period_end;
        const status = row_status(sub.status);
        const update: ISubUpdate = {
          next_billing: period_end
            ? new Date(period_end * 1000).toISOString()
            : new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...(status && { status }),
        };
        // before the update, whose row carries the reason into the queued cancel
        if (status === "inactive") await record_end_reason(sub);
        if (sub.status === "active") {
          await sub_reactivate_if(db, sub.id, FIRST_PAYMENT_INCOMPLETE);
        }
        const { row } = await sub_update(db, sub.id, update);
        // an inactive row whose sub lives on at stripe is cancelled there: unpaid
        // (retries exhausted), or a cancel we queued that never landed and still
        // charges. on every delivery, since a failed enqueue is redelivered onto
        // a row already inactive; the dedupe id collapses the repeats
        if (row?.status === "inactive" && !NO_CANCEL_TO_QUEUE.has(sub.status)) {
          await enqueue(msg("sub-deactivated", row));
        }
        console.info(
          `Updated subscription ${sub.id} next_billing to ${period_end}`
        );
        break;
      }
      case "customer.subscription.deleted": {
        // already ended at stripe, so nothing to cancel there
        const sub = stripe_event.data.object;
        await record_end_reason(sub);
        const { row } = await sub_update(db, sub.id, { status: "inactive" });
        // it can land before the handler that writes the row: stripe
        // redelivers on a non-2xx, by when the row is there to end
        if (!row) {
          return new Response(`subscription row not found: ${sub.id}`, {
            status: 404,
          });
        }
        break;
      }
      case "charge.refunded":
        await handle_charge_refunded(stripe_event);
        break;
      case "refund.failed":
        await handle_refund_failed(stripe_event);
        break;
      case "refund.updated":
        await handle_refund_updated(stripe_event);
        break;
      case "charge.dispute.created":
      case "charge.dispute.funds_withdrawn":
        await handle_dispute_opened(stripe_event);
        break;
      case "charge.dispute.closed":
        await handle_dispute_closed(stripe_event);
        break;
      default:
        return new Response(`Unhandled event type: ${stripe_event.type}`, {
          status: 201,
        });
    }

    return new Response("Received", { status: 200 });
  } catch (err) {
    // fx-converted charges: balance_transaction not yet populated. 5xx so
    // stripe redelivers on its own backoff schedule, by which time it'll be
    // ready. don't report — expected transient state.
    if (err instanceof BalanceTxnNotReadyError) {
      return new Response(err.message, { status: 503 });
    }
    // the handler queued ops' notice and process_refund reported each failed
    // dist, so unreported: the redelivery retries the dists left
    if (err instanceof ReversalIncompleteError) {
      return new Response(err.message, { status: 503 });
    }
    // stripe's own api failing a call we made: its redelivery is the retry
    if (
      err instanceof Stripe.errors.StripeRateLimitError ||
      err instanceof Stripe.errors.StripeAPIError ||
      err instanceof Stripe.errors.StripeConnectionError
    ) {
      console.warn(`stripe api transient ${err.type}: ${err.message}`);
      return new Response(err.message, { status: 503 });
    }
    // a signature that doesn't verify is a config problem (wrong
    // STRIPE_WEBHOOK_SECRET, body mutated before it reached us), not a bad
    // event. permanent, so 400 — retries can't fix it — but still reported so
    // a mis-set secret is visible instead of looking like no traffic.
    if (err instanceof Stripe.errors.StripeSignatureVerificationError) {
      report_error(err);
      return new Response(
        `stripe signature verification failed: ${err.message}`,
        {
          status: 400,
        }
      );
    }
    const error_message = err instanceof Error ? err.message : String(err);
    report_error(err);
    return new Response(error_message, { status: 400 });
  }
}
