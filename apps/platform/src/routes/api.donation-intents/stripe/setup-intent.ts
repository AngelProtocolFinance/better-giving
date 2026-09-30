import type Stripe from "stripe";
import type { IMetadata } from "@/stripe";
import { stripe } from "$/kit/stripe";

type AcssCurrency =
  Stripe.SetupIntentCreateParams.PaymentMethodOptions.AcssDebit.Currency;
const ACSS_CURRENCIES: readonly string[] = [
  "cad",
  "usd",
] satisfies AcssCurrency[];

export async function setup_intent(
  order_id: string,
  customer_id: string,
  order_currency: string,
  bank_only?: boolean
): Promise<string> {
  const c = order_currency.toLowerCase();
  // the subscription bills in the order currency, so a mandate in any other
  // one fails subscriptions.create after the donor has seen success
  const acss_ok = ACSS_CURRENCIES.includes(c);

  const { client_secret } = await stripe.setupIntents.create({
    customer: customer_id,
    ...(acss_ok && {
      payment_method_options: {
        acss_debit: {
          currency: c as AcssCurrency,
          mandate_options: {
            interval_description: "Recurring donations",
            payment_schedule: "interval",
            transaction_type: "business",
          },
          verification_method: "automatic",
        },
      },
    }),
    metadata: { order_id } satisfies IMetadata,
    ...(bank_only
      ? {
          payment_method_types: acss_ok
            ? ["us_bank_account", "acss_debit"]
            : ["us_bank_account"],
        }
      : {
          automatic_payment_methods: { enabled: true },
          ...(!acss_ok && { excluded_payment_method_types: ["acss_debit"] }),
        }),
  });

  return client_secret || "invalid client secret";
}
