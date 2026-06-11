import { loadStripe } from "@stripe/stripe-js";
import { stripe_pk } from "#/constants/env";

export const stripe_promise = loadStripe(stripe_pk);
