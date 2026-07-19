import { stripe } from "$/kit/stripe";

export async function payment_method(id: string): Promise<string> {
  const { type } = await stripe.paymentMethods.retrieve(id);
  return type;
}
