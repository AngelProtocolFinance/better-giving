import { type IPrompt, LoadText, Prompt } from "@better-giving/ui";
import {
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { type FormEventHandler, useState } from "react";
import { error_prompt, user_error_prompt } from "#/helpers/error-prompt";
import type { IDonationIntent } from "@/donations";
import { ErrorTrigger } from "../../../error";
import { use_donation_redirect } from "../../common/redirect";
import {
  donation_return_url,
  type IDonationDest,
} from "../../common/return-url";
import { StuckMsg, stuck_prompt } from "../../common/stuck-prompt";
import { use_donation } from "../../context";
import { Loader } from "../loader";

/** `done` is a paid donation whose trip to the receipt never happened: the
 * spinner has to stop, but the donate button must stay shut — a second click
 * is a second donation. */
type Status =
  | "init"
  | "loading"
  | "ready"
  | "submitting"
  | "done"
  | { error: unknown };

interface Props extends IDonationIntent {
  order_id: string;
  bank_only?: boolean;
}
// Code inspired by React Stripe.js docs, see:
// https://stripe.com/docs/stripe-js/react#useelements-hook
export function Checkout({ order_id, donor, bank_only, ...intent }: Props) {
  const { don } = use_donation();
  const [complete, set_complete] = useState(false);
  const [prompt, set_prompt] = useState<IPrompt>();
  const stripe = useStripe();
  const elements = useElements();

  // There is a small delay before Stripe Payment Element starts to load.
  // To avoid just showing the "Back" button with nothing else on screen,
  // we first show a Loader ring and when the Stripe Element starts loading
  // (it has an inherent loading animation) that's when we hide the loader ring
  // and start showing the "Back" button
  const [status, set_status] = useState<Status>("init");
  // where the donation the donor already paid for ended up. the prompt saying
  // so can be dismissed and the button behind it never re-opens, so the way
  // to the receipt has to outlive it.
  const [stuck, set_stuck] = useState<IDonationDest>();
  const redirect = use_donation_redirect();

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js hasn't yet loaded.
      // Make sure to disable form submission until Stripe.js has loaded.
      return;
    }

    set_status("submitting");

    // resolved before the confirm: stripe needs it for `confirmParams`
    const dest = donation_return_url({
      donation_id: order_id,
      base_url: don.base_url,
      success_redirect: don.config?.success_redirect,
      amount:
        intent.amount.base + intent.amount.tip + intent.amount.fee_allowance,
      currency: intent.currency,
      payment_method: "card",
      donor_name: [donor.first_name, donor.last_name],
    });

    const { error } = await stripe[
      intent.frequency !== "one-time" ? "confirmSetup" : "confirmPayment"
    ]({
      elements,
      confirmParams: { return_url: dest.url },
      redirect: "if_required",
    });

    // with redirect: "if_required", this point will be reached for both
    // successful payments and errors. Handle both cases appropriately.
    if (error) {
      if (error.type === "card_error" || error.type === "validation_error") {
        // the donor's own input, echoed back to them — not a defect. see
        // `user_error_prompt`; the stripe webhook handlers skip `card_error`
        // for the same reason.
        set_prompt(user_error_prompt(error.message));
      } else {
        set_prompt(error_prompt(error, { context: "processing payment" }));
      }
      set_status("ready");
    } else {
      redirect({
        dest,
        form_id: don.config?.id,
        parent_origin: don.config?.parent_origin,
        on_stuck: () => {
          set_status("done");
          set_stuck(dest);
          set_prompt(stuck_prompt(dest));
        },
      });
    }
  };

  if (typeof status === "object") {
    return <ErrorTrigger error={status.error} />;
  }

  return (
    <form
      data-testid="stripe-checkout-form"
      onSubmit={handleSubmit}
      className="contents"
    >
      <PaymentElement
        className="mt-4"
        options={{
          wallets: { applePay: "never", googlePay: "never", link: "never" },
          layout: "tabs",
          ...(bank_only && {
            paymentMethodOrder: ["us_bank_account"],
          }),
          defaultValues: {
            billingDetails: {
              name: `${donor.first_name} ${donor.last_name}`,
              email: donor.email,
            },
          },
        }}
        onReady={() => set_status("ready")}
        onLoadError={(error) => set_status({ error })}
        onLoaderStart={() => set_status("loading")}
        onChange={(x) => set_complete(x.complete)}
      />
      {status === "init" ? (
        <Loader />
      ) : (
        <button
          className="btn btn-form-primary w-full mt-6"
          disabled={!stripe || !elements || status !== "ready" || !complete}
          type="submit"
        >
          <LoadText text="Processing..." is_loading={status === "submitting"}>
            Donate Now
          </LoadText>
        </button>
      )}
      {stuck && <StuckMsg dest={stuck} classes="mt-4 text-sm text-muted-fg" />}
      {prompt && <Prompt {...prompt} onClose={() => set_prompt(undefined)} />}
    </form>
  );
}
