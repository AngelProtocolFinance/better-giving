import { ErrorStatus } from "@better-giving/ui";
import { Elements } from "@stripe/react-stripe-js";
import { href } from "react-router";
import use_swr from "swr/immutable";
import { report_error } from "#/errors/report";
import type { IDonationIntent, IStripeIntentReturn } from "@/donations";
import { HttpError, json_ok } from "@/helpers/https";
import { ErrorBoundaryClass } from "../../../error";
import { stripe_amounts } from "../../common/amounts";
import { currency as currencyfn } from "../../common/currency";
import { stripe_promise } from "../../common/stripe";
import { Summary } from "../../common/summary";
import { use_donation } from "../../context";
import { type StripeDonationDetails, to_step } from "../../types";
import { DonationTerms } from "../donation-terms";
import { Loader } from "../loader";
import { Checkout } from "./checkout-form";

const fetcher = async (intent: IDonationIntent) =>
  fetch(href("/api/donation-intents"), {
    method: "POST",
    body: JSON.stringify(intent),
  }).then((res) => json_ok<IStripeIntentReturn>(res));

interface IStripeCheckoutProps extends StripeDonationDetails {
  bank_only?: boolean;
}

export function StripeCheckout(props: IStripeCheckoutProps) {
  const {
    frequency,
    amount,
    tip,
    tip_format,
    cover_processing_fee,
    currency,
    bank_only,
  } = props;
  const { don, don_set } = use_donation();

  const parts = stripe_amounts({
    amount: +amount,
    tip_format,
    tip,
    cover_processing_fee,
    currency,
    bank_only,
  });

  const intent: IDonationIntent = {
    via: bank_only ? "bank" : "card",
    via_extra: "",
    frequency: frequency,
    amount: parts,
    currency: currency.code,
    to_id: don.recipient.id,
    donor: don.donor,
    source: don.source,
  };

  if (don.program) intent.program = don.program;
  if (don.config?.id) intent.form_id = don.config.id;

  // each request creates a donation row and a stripe intent
  const { data, error, isLoading } = use_swr(intent, fetcher, {
    shouldRetryOnError: false,
    // wrapped: swr's second arg is the key — the donor's intent — which
    // `report_error` would send along as context
    onError: (e) => report_error(e),
  });

  return (
    <Summary
      classes="grid content-start p-4 @xl/steps:p-8"
      on_back={() =>
        to_step(bank_only ? "stripe_bank" : "stripe", props, "donor", don_set)
      }
      Amount={currencyfn(currency)}
      amount={parts.base}
      fee_allowance={parts.fee_allowance}
      frequency={frequency}
      tip={
        parts.tip > 0
          ? { value: parts.tip, charity_name: don.recipient.name }
          : undefined
      }
    >
      <ErrorBoundaryClass>
        {isLoading ? (
          <Loader msg="Loading payment form.." />
        ) : error || !data ? (
          <ErrorStatus>
            {error instanceof HttpError && error.refused
              ? error.message
              : "We couldn't start the payment. Please try again or choose a different payment method."}
          </ErrorStatus>
        ) : (
          <Elements
            options={{
              fonts: [
                {
                  family: "Quicksand",
                  cssSrc: "https://fonts.googleapis.com/css2?family=Quicksand",
                },
              ],
              clientSecret: data.client_secret,
              appearance: {
                theme: "flat",
                variables: {
                  colorPrimary: don.config?.accent_primary,
                  fontFamily: "Quicksand, sans-serif",
                  borderRadius: "4px",
                  gridRowSpacing: "20px",
                },
              },
            }}
            stripe={stripe_promise}
          >
            <Checkout
              {...intent}
              order_id={data.order_id}
              bank_only={bank_only}
            />
          </Elements>
        )}
      </ErrorBoundaryClass>
      <DonationTerms endowName={don.recipient.name} classes="mt-5" />
    </Summary>
  );
}
