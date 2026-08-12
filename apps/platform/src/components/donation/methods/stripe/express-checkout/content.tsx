import {
  ExpressCheckoutElement,
  type ExpressCheckoutElementProps,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { href } from "react-router";
import { GENERIC_ERROR_MESSAGE } from "@/constants/common";
import type {
  IDonationIntent,
  IDonorAddressFv,
  IStripeIntentReturn,
} from "@/donations";
import { report_degraded, report_error } from "@/errors/report";
import { use_donation_redirect } from "../../../common/redirect";
import {
  donation_return_url,
  type IDonationDest,
} from "../../../common/return-url";
import { use_donation } from "../../../context";
import type { IStripeExpress } from "../use-rhf";

/** the element never came up. same copy for both ways that happens: stripe.js
 * itself was blocked (no element to fail), or the element loaded and failed. */
export const LOAD_FAILED =
  "Express checkout failed to load — please try another payment method.";

export interface IContentExternal
  extends Omit<IStripeExpress, "items" | "is_partial"> {
  classes?: string;
  on_error: (msg: string) => void;
  /**
   * the block can't be offered at all — the element failed to load (adblock,
   * csp, a network drop). raised before the donor has touched anything, so the
   * caller decides whether it's worth interrupting them. falls back to
   * `on_error` when the caller doesn't handle it. everything that goes wrong
   * *during* a payment stays on `on_error`.
   */
  on_unavailable?: (msg: string) => void;
  /**
   * the wallet payment went through but the browser never left for the
   * thank-you page. not an error — the money moved — so it's the caller's job
   * to say so, hand the donor the destination this passes back, and stop
   * offering to take the payment again.
   */
  on_stuck?: (dest: IDonationDest) => void;
}
export interface IContent extends IContentExternal {
  on_click: ExpressCheckoutElementProps["onClick"];
}
export function Content({
  classes = "",
  on_click,
  on_error,
  on_unavailable,
  on_stuck,
  ...x
}: IContent) {
  const { don } = use_donation();
  const elements = useElements();
  const stripe = useStripe();
  const redirect = use_donation_redirect();

  const on_confirm: ExpressCheckoutElementProps["onConfirm"] = async (ev) => {
    if (!stripe || !elements) return;

    const { error: submit_err } = await elements.submit();
    if (submit_err) {
      // both, not either: the sheet has to close on a failure, and the donor
      // needs the reason somewhere they can still read it once it has.
      ev.paymentFailed({ reason: "fail", message: submit_err.message });
      return on_error(submit_err.message || GENERIC_ERROR_MESSAGE);
    }

    const { billingDetails: b, expressPaymentType } = ev;
    if (!b?.email) {
      // the sheet is the only place a different email can be picked, so it
      // has to hear about it — and it's the payment data that's unusable, not
      // the address, which is the one the sheet would ask them to re-enter.
      ev.paymentFailed({
        reason: "invalid_payment_data",
        message: "We need an email address to send your donation receipt.",
      });
      return on_error("your email was not found in billing details.");
    }
    const [fn, ln] = b.name.split(" ");
    const addr: IDonorAddressFv = {
      street: [b.address.line1, b.address.line2].filter(Boolean).join(" "),
      city: b.address.city,
      state: b.address.state,
      country: b.address.country,
      zip_code: b.address.postal_code,
    };

    const intent: IDonationIntent = {
      via: "card",
      via_extra: "",
      to_id: don.recipient.id,
      amount: {
        base: x.base,
        tip: x.tip,
        fee_allowance: x.fee_allowance,
      },
      currency: x.currency,
      frequency: x.frequency,
      source: don.source,
      donor: {
        title: "",
        email: b.email,
        first_name: fn,
        last_name: ln,
        address: addr,
      },
    };

    if (don.program) intent.program = don.program;
    if (don.config?.id) intent.form_id = don.config.id;

    // everything past here runs with the donor already authorized in the
    // sheet, so no path out of it may be silent — a throw owes the sheet the
    // same answer an error return does.
    try {
      const res = await fetch(href("/api/donation-intents"), {
        method: "POST",
        body: JSON.stringify(intent),
      });

      if (!res.ok) {
        // nothing the donor can fix in the sheet, but it still has to close on
        // a failure rather than spin on a payment that never gets confirmed
        ev.paymentFailed({ reason: "fail" });
        return on_error(`Failed to create donation intent: ${res.statusText}`);
      }

      const { order_id, client_secret }: IStripeIntentReturn = await res.json();

      // resolved before the confirm: stripe needs it for `confirmParams`
      const dest = donation_return_url({
        donation_id: order_id,
        base_url: don.base_url,
        success_redirect: don.config?.success_redirect,
        amount:
          intent.amount.base + intent.amount.tip + intent.amount.fee_allowance,
        currency: intent.currency,
        payment_method: expressPaymentType,
        donor_name: [fn, ln],
      });

      const { error } = await stripe[
        x.frequency !== "one-time" ? "confirmSetup" : "confirmPayment"
      ]({
        elements,
        clientSecret: client_secret,
        confirmParams: { return_url: dest.url },
        redirect: "if_required",
      });

      if (error) {
        report_error(error);
        ev.paymentFailed({ reason: "fail" });
        return on_error(error.message || GENERIC_ERROR_MESSAGE);
      }

      redirect({
        dest,
        form_id: don.config?.id,
        parent_origin: don.config?.parent_origin,
        on_stuck: () => on_stuck?.(dest),
      });
    } catch (err) {
      // a rejected fetch, a body that isn't json, a throw out of stripe.js
      report_error(err);
      ev.paymentFailed({ reason: "fail" });
      on_error(GENERIC_ERROR_MESSAGE);
    }
  };

  return (
    <ExpressCheckoutElement
      id="express-checkout"
      className={classes}
      onConfirm={on_confirm}
      onClick={on_click}
      onLoadError={(ev) => {
        // pre-interaction: the element never came up, so nothing has been paid
        // and no donor action is waiting on an answer.
        //
        // two unrelated failures arrive here. `api_connection_error` is
        // stripe's own code for "the browser could not reach us" — the donor's
        // network, nothing to fix. anything else is the request we sent, and an
        // amount stripe rejects for the currency lands here too, so it has to
        // stay loud.
        const kind = (ev.error as { type?: string } | undefined)?.type;
        const report =
          kind === "api_connection_error" ? report_degraded : report_error;
        report(ev.error);
        (on_unavailable ?? on_error)(LOAD_FAILED);
      }}
      options={{
        layout: { overflow: "never" },
        buttonTheme: {
          googlePay: "white",
          applePay: "white",
        },
        emailRequired: true,
        billingAddressRequired: true,
      }}
    />
  );
}
