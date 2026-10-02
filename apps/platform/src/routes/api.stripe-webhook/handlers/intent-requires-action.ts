import { donation_microdeposit_action as email } from "emails";
import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import type { IDonation } from "@/donations";
import { send_email } from "$/email";
import { stripe } from "$/kit/stripe";
import { db } from "$/pg/db";
import {
  donation_settle_state_locked,
  donation_update,
} from "$/pg/queries/donation";

type Intent = Stripe.PaymentIntent | Stripe.SetupIntent;

const AWAITING_PAYMENT = new Set<IDonation["status"]>(["created", "intent"]);

/**
 * Payment and Setup Intent alike - moves the order's existing donation to "intent"
 * with the deposit verification URL and emails the donor that link; throws if the
 * donation is missing, skips one already past awaiting payment
 */
export async function handle_intent_requires_action(intent: Intent) {
  if (!intent.metadata) {
    throw new Error(`missing intent metadata for intent:${intent.id}`);
  }
  const verification_link =
    intent.next_action?.verify_with_microdeposits?.hosted_verification_url;

  if (!verification_link) {
    throw new Error(`missing verification link - intent:${intent.id}`);
  }

  const { order_id } = intent.metadata;

  const pm = await stripe.paymentMethods
    .retrieve(str_id(intent.payment_method))
    .then((x) => x.type);
  const don = await db.transaction(async (tx) => {
    const state = await donation_settle_state_locked(tx, order_id);
    if (!state) throw new Error(`donation not found: ${order_id}`);
    // a redelivery can land after the payment settled: a paid gift must not
    // go back to intent, nor its donor get a verification link
    if (!AWAITING_PAYMENT.has(state.status)) return null;
    return donation_update(tx, order_id, {
      via: `stripe:${pm}`,
      via_extra: verification_link,
      status: "intent",
    });
  });
  if (!don) {
    console.info(
      `requires_action on donation ${order_id} past intent: skipped`
    );
    return;
  }

  const x: email.IData = {
    to_name: don.to_name,
    from_name: don.from_name?.split(" ")[0] ?? "Donor",
    verification_link: verification_link,
  };
  const { node, subject } = email.template(x);

  return send_email({ node, subject, to: [don.from_email] });
}
