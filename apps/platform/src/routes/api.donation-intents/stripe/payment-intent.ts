import { to_atomic_c } from "#/helpers/stripe";
import type { IAmount } from "@/donations";
import type { IMetadata } from "@/stripe";
import { stripe } from "$/kit/stripe";

export interface IInput extends IAmount {
  order_id: string;
  currency: string;
  customer_id: string;
  bank_only?: boolean;
}

export async function payment_intent(i: IInput): Promise<string> {
  const to_pay = i.base + i.fee_allowance + i.tip;
  const { client_secret } = await stripe.paymentIntents.create({
    amount: to_atomic_c(i.currency)(to_pay),
    currency: i.currency.toLowerCase(),
    customer: i.customer_id,
    metadata: { order_id: i.order_id } satisfies IMetadata,
    payment_method_options: {
      acss_debit: {
        mandate_options: {
          payment_schedule: "sporadic",
          transaction_type: "business",
        },
        setup_future_usage: "on_session",
        verification_method: "automatic",
      },
    },
    ...(i.bank_only
      ? { payment_method_types: ["us_bank_account", "acss_debit"] }
      : { automatic_payment_methods: { enabled: true } }),
  });
  return client_secret || "invalid client secret";
}
