import { report_error } from "@/errors/report";
import * as sub_deactivated from "@/queue/msgs/sub-deactivated";
import type { ISubUpdate } from "@/subscriptions";
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

/**
 * webhook signing logic inspired by stripe-node,
 * @see {@link https://github.com/stripe/stripe-node/blob/master/examples/webhook-signing/nextjs/app/api/webhooks/route.ts}
 */
export async function action({ request }: Route.ActionArgs) {
  const signature = request.headers.get("stripe-signature");
  if (!signature)
    return new Response("missing signature header", { status: 403 });

  const body = await request.text();
  const stripe_event = stripe.webhooks.constructEvent(
    body,
    signature,
    stripe_env.webhook_secret
  );

  try {
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
        const { object: sub } = stripe_event.data;
        const period_end = sub.items.data[0]?.current_period_end;
        const update: ISubUpdate = {
          next_billing: period_end
            ? new Date(period_end * 1000).toISOString()
            : new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: sub.status === "active" ? "active" : "inactive",
        };
        const { row, prev_status } = await sub_update(db, sub.id, update);
        if (row && prev_status === "active" && row.status === "inactive") {
          await enqueue(sub_deactivated.to_msg(row));
        }
        console.info(
          `Updated subscription ${sub.id} next_billing to ${period_end}`
        );
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
    const error_message = err instanceof Error ? err.message : String(err);
    report_error(err);
    return new Response(error_message, { status: 400 });
  }
}
