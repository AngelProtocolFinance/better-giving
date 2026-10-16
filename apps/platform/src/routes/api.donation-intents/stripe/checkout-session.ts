import { to_atomic_c } from "#/helpers/stripe";
import type { IAmount } from "@/donations";
import type { IMetadata } from "@/stripe";
import { base_url } from "$/env";
import { stripe } from "$/kit/stripe";

export interface ICheckoutSessionInput extends IAmount {
  order_id: string;
  customer_id: string;
  donor_email: string;
  recipient_name: string;
  descriptor_suffix?: string;
}

export interface ICheckoutSession {
  id: string;
  url: string;
}

export async function checkout_session(
  input: ICheckoutSessionInput
): Promise<ICheckoutSession> {
  const total = input.base + input.tip + input.fee_allowance;
  const metadata = { order_id: input.order_id } satisfies IMetadata;
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer: input.customer_id,
      customer_update: { address: "auto", name: "auto" },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: to_atomic_c("USD")(total),
            product_data: {
              name: `Donation to ${input.recipient_name}`,
            },
          },
        },
      ],
      metadata,
      payment_intent_data: {
        capture_method: "automatic",
        metadata,
        receipt_email: input.donor_email,
        ...(input.descriptor_suffix && {
          statement_descriptor_suffix: input.descriptor_suffix,
        }),
      },
      success_url: `${base_url}/agents?donation_id=${input.order_id}`,
      cancel_url: `${base_url}/agents?donation_id=${input.order_id}`,
    },
    { idempotencyKey: `agent-checkout:${input.order_id}` }
  );

  if (!session.url) throw new Error("Stripe Checkout did not return a URL");
  return { id: session.id, url: session.url };
}

export async function checkout_session_url(id: string): Promise<string> {
  const session = await stripe.checkout.sessions.retrieve(id);
  if (!session.url) throw new Error("Stripe Checkout did not return a URL");
  return session.url;
}
