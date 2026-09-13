import { ErrorStatus } from "@better-giving/ui";
import { Elements } from "@stripe/react-stripe-js";
import { href } from "react-router";
import use_swr from "swr/immutable";
import { report_error } from "#/errors/report";
import { PROCESSING_RATES } from "@/constants/common";
import type { IDonationIntent, IStripeIntentReturn } from "@/donations";
import { min_fee_allowance } from "@/helpers/donation";
import { HttpError, json_ok } from "@/helpers/https";
import { ErrorBoundaryClass } from "../../../error";
import { currency as currencyfn } from "../../common/currency";
import { stripe_promise } from "../../common/stripe";
import { Summary } from "../../common/summary";
import { use_donation } from "../../context";
import { type StripeDonationDetails, tip_val, to_step } from "../../types";
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

  const tipv = tip_val(tip_format, tip, +amount);

  const rate = bank_only
    ? PROCESSING_RATES.stripe_bank
    : PROCESSING_RATES.stripe;
  const flat = bank_only ? 0 : PROCESSING_RATES.stripe_flat * currency.rate;
  const raw_mfa = cover_processing_fee
    ? min_fee_allowance(tipv + +amount, rate, flat)
    : 0;
  // cap bank fee at $5 converted to donor currency
  const mfa =
    bank_only && raw_mfa > PROCESSING_RATES.stripe_bank_cap * currency.rate
      ? PROCESSING_RATES.stripe_bank_cap * currency.rate
      : raw_mfa;

  const intent: IDonationIntent = {
    via: bank_only ? "bank" : "card",
    via_extra: "",
    frequency: frequency,
    amount: {
      base: +amount,
      tip: tip_val(tip_format, tip, +amount),
      fee_allowance: mfa,
    },
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
      amount={+amount}
      fee_allowance={mfa}
      frequency={frequency}
      tip={
        tipv > 0 ? { value: tipv, charity_name: don.recipient.name } : undefined
      }
    >
      <ErrorBoundaryClass>
        {isLoading ? (
          <Loader msg="Loading payment form.." />
        ) : error || !data ? (
          <ErrorStatus>
            {error instanceof HttpError && error.message
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
