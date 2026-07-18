import type Stripe from "stripe";

export interface IMetadata extends Stripe.Metadata {
  order_id: string;
  /** @legacy attributes */
  [key: string]: string;
}
