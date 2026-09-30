import { currency_precision, from_stripe_amount } from "#/helpers/stripe";

/** a stripe atomic amount for an ops notice, e.g. `12.50 USD` */
export const money = (atomic: number, currency: string) =>
  `${from_stripe_amount(atomic, currency).toFixed(currency_precision(currency))} ${currency.toUpperCase()}`;
