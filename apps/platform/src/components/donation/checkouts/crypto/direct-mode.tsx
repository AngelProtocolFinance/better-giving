import { ContentLoader, ErrorStatus, use_ask_prompt } from "@better-giving/ui";
import { useEffect } from "react";
import { href, useNavigation } from "react-router";
import use_swr from "swr/immutable";
import { report_error } from "#/errors/report";
import type { Payment } from "#/types/crypto";
import type { IDonationIntent, IDonorFv } from "@/donations/schema";
import { ru_vdec } from "@/helpers/decimal";
import { HttpError, json_ok } from "@/helpers/https";
import { ContinueBtn } from "../../common/continue-btn";
import { use_donation_redirect } from "../../common/redirect";
import { donation_return_url } from "../../common/return-url";
import { stuck_prompt } from "../../common/stuck-prompt";
import type { CryptoDonationDetails, Init } from "../../types";
import { PayQr } from "./pay-qr";

type Props = {
  classes?: string;
  fv: CryptoDonationDetails;
  donor: IDonorFv;
  init: Init;
  fee_allowance: number;
  tipv: number;
};

const fetcher = async (intent: IDonationIntent): Promise<Payment> => {
  const res = await fetch(href("/api/donation-intents"), {
    method: "POST",
    body: JSON.stringify(intent),
  });
  // the 400 the intent route answers a below-minimum donation with is
  // deliberate — the client validates `base` against a cached minimum while
  // the server checks `base + tip + fee_allowance` against a freshly fetched
  // one, so an amount within a percent of the minimum can pass here and fail
  // there.
  //
  // the route's refusals are donor-facing text — most usefully the token's
  // actual minimum. anything else (a 5xx error page, an edge block) keeps the
  // generic message.
  return json_ok<Payment>(res);
};

/**
 * one prompt slot: every raise replaces the one on screen rather than stacking
 * over it.
 */
const PROMPT_SLOT = "crypto-checkout";

export function DirectMode({
  fv,
  init,
  classes = "",
  donor,
  fee_allowance,
  tipv,
}: Props) {
  const ask_prompt = use_ask_prompt();
  const navigation = useNavigation();
  const redirect = use_donation_redirect();

  const handle_continue = () => {
    // the button below is disabled until there's an order to continue with —
    // this stays as a type guard, not as a way to fail. a throw here would
    // put an error boundary in front of a donor who had already sent crypto.
    const id = data?.order_id;
    if (!id) return;

    const dest = donation_return_url({
      donation_id: id,
      base_url: init.base_url,
      success_redirect: init.config?.success_redirect,
      amount: fv.token.amount,
      currency: fv.token.code,
      payment_method: "crypto",
      donor_name: [donor.first_name, donor.last_name],
    });

    redirect({
      dest,
      form_id: init.config?.id,
      parent_origin: init.config?.parent_origin,
      on_stuck: () => ask_prompt(stuck_prompt(dest), { key: PROMPT_SLOT }),
    });
  };

  const intent: IDonationIntent = {
    via: "crypto",
    via_extra: "",
    frequency: "one-time",
    amount: {
      base: +fv.token.amount,
      tip: tipv,
      fee_allowance,
    },
    currency: fv.token.code,
    to_id: init.recipient.id,
    source: init.source,
    donor,
  };

  if (init.program) intent.program = init.program;
  if (init.config?.id) intent.form_id = init.config.id;

  const { data, isLoading, error } = use_swr(intent, fetcher);

  // report_error drops a refused HttpError, so the deliberate below-minimum
  // answer never pages; any other non-ok answer or a malformed body does
  useEffect(() => {
    if (error) report_error(error);
  }, [error]);

  // once the payment exists, the server's amount (nowpayments' pay_amount when
  // it made the payment) is what settles it in full — the form's own sum
  // drifts from it by the reconversion spread. rounding up keeps the shown
  // figure at or above that amount.
  const total_disp_amnt = ru_vdec(
    data?.amount ?? +fv.token.amount + tipv + fee_allowance,
    data?.usdpu ?? fv.token.usdpu,
    fv.token.precision
  );

  return (
    <div className={`${classes} grid justify-items-center`}>
      <p className="text-balance text-center mb-3.5 max-w-sm">
        To complete your donation, send {total_disp_amnt}
        &nbsp;
        {fv.token.symbol} from your crypto wallet to the address below
      </p>
      {isLoading ? (
        <ContentLoader className="size-48 rounded" />
      ) : error || !data ? (
        <ErrorStatus>
          {error instanceof HttpError && error.refused
            ? error.message
            : "Failed to load donation address"}
        </ErrorStatus>
      ) : (
        <PayQr
          token={fv.token}
          recipient={data.address}
          extraId={data.extra_address ?? null}
        />
      )}

      <p className="text-sm text-gray-11 mt-4 indent-4 leading-normal">
        Please note that manual donations of cryptocurrencies using the QR code
        may take up to 1 business day to process. Due to market fluctuations,
        the value of your cryptocurrency donation may vary between the time it
        is sent and the time it is received. Donors are responsible for ensuring
        they send the correct token and amount pledged, as incorrect submissions
        may result in processing errors and/or a permanent loss of funds. Better
        Giving takes no responsibility for any variance in value of the donation
        made during the processing period, or any loss of funds caused by donor
        error when the donation is made.
      </p>

      <ContinueBtn
        disabled={!data?.order_id || !!error || isLoading}
        is_loading={navigation.state !== "idle"}
        loading_text="Redirecting..."
        onClick={handle_continue}
        text="I have completed the payment"
        className="justify-self-stretch mt-8"
      />
    </div>
  );
}
