import { Elements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { useEffect, useRef } from "react";
import { report_degraded } from "@/errors/report";
import { stripe_load, stripe_promise } from "../../../common/stripe";
import type { IStripeExpress } from "../use-rhf";
import { Content, type IContentExternal, LOAD_FAILED } from "./content";

interface Props extends IStripeExpress, IContentExternal {
  validate: () => Promise<boolean>;
  /** this donor has already been charged on one of the rails. the element
   * stays mounted — tearing it down while its sheet may still be open is the
   * failure this whole flow exists to avoid — but it stops opening. */
  paid?: boolean;
}

export function ExpressCheckout({
  classes = "",
  items,
  validate,
  paid,
  ...p
}: Props) {
  const c = p.currency.toLowerCase();

  // read at call time so the effect stays mount-only
  const degrade_ref = useRef(p.on_unavailable ?? p.on_error);
  degrade_ref.current = p.on_unavailable ?? p.on_error;

  useEffect(() => {
    let mounted = true;
    stripe_load.then((r) => {
      if (!mounted || r.ok) return;
      // stripe.js never came up, so the element below is never created and its
      // onLoadError can't fire — without this the donor gets an empty div and
      // nothing reaches sentry. pre-interaction: nothing has been paid and no
      // donor action is waiting on an answer. js.stripe.com is unreachable from
      // the donor's browser by the time this fires, so it's degraded, not ours.
      report_degraded(r.err);
      degrade_ref.current(LOAD_FAILED);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const opts: StripeElementsOptions =
    p.frequency !== "one-time"
      ? { mode: "setup", currency: c }
      : { mode: "payment", amount: p.total_atomic, currency: c };

  return (
    <Elements stripe={stripe_promise} options={opts}>
      <Content
        classes={classes}
        on_click={async ({ resolve, reject }) => {
          // the sheet only opens on `resolve`, so this is where a second
          // payment is refused — no dom trick, and nothing already open is
          // touched.
          if (paid) return reject();

          const valid = await validate();
          if (!valid) return reject();

          resolve(
            p.frequency !== "one-time"
              ? {
                  lineItems: items.map((x) => ({
                    name: x.name,
                    amount: x.amount_atomic,
                  })),
                }
              : undefined
          );
        }}
        {...p}
      />
    </Elements>
  );
}
