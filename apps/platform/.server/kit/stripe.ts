import Stripe from "stripe";
import { stripe as stripe_env } from "../env";

// a literal, not the sdk's exported ApiVersion, so a `pnpm up stripe` fails to
// compile here instead of silently moving the donation path to a new version.
export const stripe = new Stripe(stripe_env.secret_key, {
  apiVersion: "2026-08-26.dahlia",
});
