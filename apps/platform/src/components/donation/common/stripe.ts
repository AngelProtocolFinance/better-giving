import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { stripe_pk } from "#/constants/env";

export const stripe_promise = loadStripe(stripe_pk);

export type TStripeLoad = { ok: true } | { ok: false; err: unknown };

/**
 * a blocked js.stripe.com (adblocker, csp, network drop) makes loadStripe
 * reject; a script that loads without attaching stripe resolves null, as does
 * the server, where it's a no-op. `<Elements>` swallows both — it renders its
 * children but never builds an elements instance, so no element is created and
 * no element event can fire. normalize the two into one settled outcome a
 * caller can degrade on. standalone so either branch is testable without the
 * module-scope promise below.
 */
export const settle_stripe = (
  p: Promise<Stripe | null>
): Promise<TStripeLoad> =>
  p.then(
    (s): TStripeLoad =>
      s
        ? { ok: true }
        : { ok: false, err: new Error("stripe.js did not load") },
    (err): TStripeLoad => ({ ok: false, err })
  );

/**
 * attached where the promise is created so a rejecting loadStripe is never an
 * unhandled rejection at module scope. reporting and degrading happen at the
 * consumer, in an effect — this resolves not-ok on the server too, where
 * nothing is wrong.
 */
export const stripe_load = settle_stripe(stripe_promise);
