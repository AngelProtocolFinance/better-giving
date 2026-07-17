import Stripe from "stripe";
import { stripe as stripe_env } from "../env";

export const stripe = new Stripe(stripe_env.secret_key);
