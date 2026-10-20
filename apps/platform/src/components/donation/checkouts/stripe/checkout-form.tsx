import { LoadText, use_ask_prompt } from "@better-giving/ui";
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
import { pin_bar, pin_bleed } from "../../pin";
import { Loader } from "../loader";

const BANK_COULD_NOT_VERIFY =
  "Your bank couldn't verify this card. Try again or use another card.";

/** what to tell the donor, or nothing when the failure is ours to report.
 * authentication failures are not `card_error` — stripe sends them as
 * `invalid_request_error` — and a card error's own message is the one the
 * donor can act on. */
function donor_card_message(error: {
  type?: string;
  code?: string;
  message?: string;
}): string | undefined {
  if (
    error.code === "payment_intent_authentication_failure" ||
    error.code === "setup_intent_authentication_failure"
  ) {
    return BANK_COULD_NOT_VERIFY;
  }
  if (error.type === "card_error" || error.type === "validation_error") {
    return error.message;
  }
  return undefined;
}

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
// code inspired by react stripe.js docs, see:
// https://stripe.com/docs/stripe-js/react#useelements-hook
/**
 * one prompt slot: every raise replaces the one on screen rather than stacking
 * over it.
 */
const PROMPT_SLOT = "stripe-checkout";

export function Checkout({ order_id, donor, bank_only, ...intent }: Props) {
  const { don } = use_donation();
  const ask_prompt = use_ask_prompt();
  const [complete, set_complete] = useState(false);
  const stripe = useStripe();
  const elements = useElements();

  // there is a small delay before stripe's payment element starts to load.
  // to avoid just showing the "Back" button with nothing else on screen,
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
      // stripe.js hasn't yet loaded.
      // make sure to disable form submission until stripe.js has loaded.
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
    // successful payments and errors.
    if (error) {
      const donor_message = donor_card_message(error);
      if (donor_message) {
        ask_prompt(user_error_prompt(donor_message), { key: PROMPT_SLOT });
      } else {
        ask_prompt(error_prompt(error, { context: "processing payment" }), {
          key: PROMPT_SLOT,
        });
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
          ask_prompt(stuck_prompt(dest), { key: PROMPT_SLOT });
        },
      });
    }
  };

  if (typeof status === "object") {
    return <ErrorTrigger error={status.error} />;
  }

  const pin = don.pin === true && status !== "init";
  const pay = (
    <button
      className={
        pin ? "btn btn-form-primary w-full" : "btn btn-form-primary w-full mt-6"
      }
      disabled={!stripe || !elements || status !== "ready" || !complete}
      type="submit"
    >
      <LoadText text="Processing..." is_loading={status === "submitting"}>
        Donate Now
      </LoadText>
    </button>
  );

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
      ) : pin ? (
        <div data-pin="" className={`${pin_bar} ${pin_bleed} order-1`}>
          {pay}
        </div>
      ) : (
        pay
      )}
      {stuck && <StuckMsg dest={stuck} classes="mt-4 text-sm text-gray-11" />}
    </form>
  );
}
