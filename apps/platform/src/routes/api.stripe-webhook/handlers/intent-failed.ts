import { donation_error as email } from "emails";
import type Stripe from "stripe";
import type { IMetadata } from "@/stripe";
import { send_email } from "$/email";
import { stripe } from "$/kit/stripe";
import { donation_get } from "$/pg/queries/donation";

/** sends an email to donor as to why the payment failed */
export async function handle_intent_failed(
  data: Stripe.PaymentIntentPaymentFailedEvent.Data
) {
  const err = data.object.last_payment_error;
  if (err?.type === "card_error") return; // already handled in frontend
  const meta = await (async (pi) => {
    // subs pi metadata is empty object // retrieve from invoice
    if (Object.keys(pi.metadata).length === 0) {
      const { data: ips } = await stripe.invoicePayments.list({
        payment: { payment_intent: pi.id, type: "payment_intent" },
        expand: ["data.invoice"],
      });
      const inv = ips[0]?.invoice;
      if (!inv || typeof inv === "string" || inv.deleted)
        throw "missing invoice";
      const m = inv.parent?.subscription_details?.metadata as IMetadata | null;
      if (!m) throw "missing invoice metadata";
      return m;
    }
    return pi.metadata as unknown as IMetadata;
  })(data.object);

  // stripe metadata carries the order id and nothing else — the donor name,
  // donor email and recipient name it used to hold are no longer written
  // (api.donation-intents/stripe/payment-intent.ts). the order row is where
  // they live now, same as the setup-intent-failed sibling.
  const order = await donation_get(meta.order_id);
  if (!order) throw new Error(`Order ${meta.order_id} not found`);

  const x: email.IData = {
    recipient_name: order.to_name,
    donor_first_name: order.from_name?.split(" ")[0] ?? "Donor",
    error_message: `Payment Intent ID ${data.object.id} failed due to: ${
      err?.message ?? "Stripe error"
    }`,
  };
  const { node, subject } = email.template(x);

  await send_email({ node, subject, to: [order.from_email] });
}
