import type { IMetadata } from "@/stripe";
import { stripe } from "$/kit/stripe";

export async function setup_intent(
  order_id: string,
  customer_id: string,
  bank_only?: boolean
): Promise<string> {
  const { client_secret } = await stripe.setupIntents.create({
    customer: customer_id,
    payment_method_options: {
      acss_debit: {
        currency: "cad",
        mandate_options: {
          interval_description: "Recurring donations",
          payment_schedule: "interval",
          transaction_type: "business",
        },
        verification_method: "automatic",
      },
    },
    metadata: { order_id } satisfies IMetadata,
    ...(bank_only
      ? { payment_method_types: ["us_bank_account", "acss_debit"] }
      : { automatic_payment_methods: { enabled: true } }),
  });

  return client_secret || "invalid client secret";
}
