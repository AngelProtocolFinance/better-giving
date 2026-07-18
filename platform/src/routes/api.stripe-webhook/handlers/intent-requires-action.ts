import { donation_microdeposit_action as email } from "emails";
import type Stripe from "stripe";
import { str_id } from "#/helpers/stripe";
import { send_email } from "$/email";
import { stripe } from "$/kit/stripe";
import { db } from "$/pg/db";
import { donation_update } from "$/pg/queries/donation";

type Intent = Stripe.PaymentIntent | Stripe.SetupIntent;

/**
 * Payment Intent - Updates intent transaction with deposit verification URL, status is still "intent"
 * Setup Intent   - Creates an "intent" donation record with deposit verification URL
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
  const don = await donation_update(db, order_id, {
    via: `stripe:${pm}`,
    via_extra: verification_link,
    status: "intent",
  });

  const x: email.IData = {
    to_name: don.to_name,
    from_name: don.from_name?.split(" ")[0] ?? "Donor",
    verification_link: verification_link,
  };
  const { node, subject } = email.template(x);

  return send_email({ node, subject, to: [don.from_email] });
}
