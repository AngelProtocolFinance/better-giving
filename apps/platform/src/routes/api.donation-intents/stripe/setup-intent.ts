import type Stripe from "stripe";
import type { IMetadata } from "@/stripe";
import { stripe } from "$/kit/stripe";

type AcssCurrency =
  Stripe.SetupIntentCreateParams.PaymentMethodOptions.AcssDebit.Currency;
type BankMethod = Extract<
  Stripe.SetupIntentCreateParams.ExcludedPaymentMethodType,
  "us_bank_account" | "acss_debit"
>;

/**
 * the currencies each bank debit can mandate. the subscription bills in the
 * order currency, so a mandate in any other one fails subscriptions.create
 * after the donor has seen success
 */
const MANDATE_CURRENCIES: Record<BankMethod, readonly string[]> = {
  us_bank_account: ["usd"],
  acss_debit: ["cad", "usd"] satisfies AcssCurrency[],
};
const BANK_METHODS = Object.keys(MANDATE_CURRENCIES) as BankMethod[];

/** the bank debits a recurring gift in `currency` can be billed through */
export const recurring_bank_methods = (currency: string): BankMethod[] => {
  const c = currency.toLowerCase();
  return BANK_METHODS.filter((m) => MANDATE_CURRENCIES[m].includes(c));
};

export async function setup_intent(
  order_id: string,
  customer_id: string,
  order_currency: string,
  bank_only?: boolean
): Promise<string> {
  const c = order_currency.toLowerCase();
  const billable = recurring_bank_methods(c);
  const excluded = BANK_METHODS.filter((m) => !billable.includes(m));

  const { client_secret } = await stripe.setupIntents.create({
    customer: customer_id,
    ...(billable.includes("acss_debit") && {
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
      ? { payment_method_types: billable }
      : {
          automatic_payment_methods: { enabled: true },
          // a setup intent carries no currency, so the dashboard's dynamic
          // methods can't filter by the one the subscription bills in
          ...(excluded.length > 0 && {
            excluded_payment_method_types: excluded,
          }),
        }),
  });

  return client_secret || "invalid client secret";
}
