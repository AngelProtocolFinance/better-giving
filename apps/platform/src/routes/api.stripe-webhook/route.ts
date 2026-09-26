import Stripe from "stripe";
import { report_error } from "#/errors/report";
import { msg } from "@/queue";
import type { ISubUpdate, TStatus } from "@/subscriptions";
import { stripe as stripe_env } from "$/env";
import { enqueue } from "$/kit/queue";
import { stripe } from "$/kit/stripe";
import { db } from "$/pg/db";
import { sub_update } from "$/pg/queries/subscription";
import type { Route } from "./+types/route";
import {
  handle_charge_refunded,
  handle_intent_failed,
  handle_intent_requires_action,
  handle_setup_intent_failed,
  handle_setup_intent_succeeded,
} from "./handlers";
import { handle_intent_succeeded } from "./handlers/intent-suceeded";
import { handle_subscription_created } from "./handlers/subscription-created";
import { BalanceTxnNotReadyError } from "./helpers/settled";

/** ended at stripe: nothing left to cancel there */
const ENDED_AT_STRIPE = new Set<Stripe.Subscription.Status>([
  "canceled",
  "incomplete_expired",
]);

/**
 * rows are born active, so the webhook only ever moves one to inactive —
 * stripe can't revive a canceled sub, so it never reactivates the row.
 * undefined leaves the status as is: past_due, incomplete, trialing and paused can still recover
 */
const row_status = (live: Stripe.Subscription.Status): TStatus | undefined => {
  switch (live) {
    case "unpaid":
    case "canceled":
    case "incomplete_expired":
      return "inactive";
    default:
      return undefined;
  }
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
        const { row } = await sub_update(db, sub.id, update);
        // an inactive row whose sub lives on at stripe is cancelled there: unpaid
        // (retries exhausted), or a cancel we queued that never landed and still
        // charges. on every delivery, since a failed enqueue is redelivered onto
        // a row already inactive; the dedupe id collapses the repeats
        if (row?.status === "inactive" && !ENDED_AT_STRIPE.has(sub.status)) {
          await enqueue(msg("sub-deactivated", row));
        }
        console.info(
          `Updated subscription ${sub.id} next_billing to ${period_end}`
        );
        break;
      }
      case "customer.subscription.deleted": {
        // already ended at stripe, so nothing to cancel there
        await sub_update(db, stripe_event.data.object.id, {
          status: "inactive",
        });
        break;
      }
      case "charge.refunded":
        await handle_charge_refunded(stripe_event.data);
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
