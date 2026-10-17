import { href } from "react-router";
import { to_atomic_c } from "#/helpers/stripe";
import type { IAmount } from "@/donations";
import type { IMetadata } from "@/stripe";
import { base_url } from "$/env";
import { stripe } from "$/kit/stripe";

export interface ICheckoutSessionInput extends IAmount {
  order_id: string;
  donor_email: string;
  recipient_name: string;
  /** where a donor who backs out of Checkout lands: the recipient's donate page */
  cancel_path: string;
  descriptor_suffix?: string;
  /** stable across retries of one attempt; a replacement checkout uses a new one */
  idempotency_key?: string;
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
      customer_email: input.donor_email,
      customer_creation: "always",
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
      success_url: `${base_url}${href("/donations/:id", { id: input.order_id })}`,
      cancel_url: `${base_url}${input.cancel_path}`,
    },
    {
      idempotencyKey:
        input.idempotency_key ?? `agent-checkout:${input.order_id}`,
    }
  );

  if (!session.url) throw new Error("Stripe Checkout did not return a URL");
  return { id: session.id, url: session.url };
}

export type TCheckoutSessionState =
  | { status: "open"; url: string }
  | { status: "complete" | "expired" };

export async function checkout_session_state(
  id: string
): Promise<TCheckoutSessionState> {
  const session = await stripe.checkout.sessions.retrieve(id);
  if (session.status === "open") {
    if (!session.url) throw new Error("Stripe Checkout did not return a URL");
    return { status: "open", url: session.url };
  }
  return { status: session.status === "complete" ? "complete" : "expired" };
}
