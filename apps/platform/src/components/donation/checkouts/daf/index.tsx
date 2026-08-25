import { ContentLoader, type IPrompt, Prompt } from "@better-giving/ui";
import { useEffect, useRef, useState } from "react";
import { href } from "react-router";
import { chariot_connect_id } from "#/constants/env";
import { error_prompt } from "#/helpers/error-prompt";
import { to_atomic } from "#/helpers/stripe";
import { PROCESSING_RATES } from "@/constants/common";
import type { ChariotMetadata } from "@/donations";
import { partition } from "@/donations/helpers";
import type {
  IAmount,
  IDonationIntent,
  IDonorAddress,
} from "@/donations/schema";
import { min_fee_allowance } from "@/helpers/donation";
import { usd_option } from "../../common/constants";
import { currency } from "../../common/currency";
import { use_donation_redirect } from "../../common/redirect";
import {
  donation_return_url,
  type IDonationDest,
} from "../../common/return-url";
import { StuckMsg, stuck_prompt } from "../../common/stuck-prompt";
import { Summary } from "../../common/summary";
import { use_donation } from "../../context";
import {
  type DafDonationDetails,
  tip_from_val,
  tip_val,
  to_step,
} from "../../types";
import { DonationTerms } from "../donation-terms";

const CDN_SRC = "https://cdn.givechariot.com/chariot-connect.umd.js";

export function ChariotCheckout(props: DafDonationDetails) {
  const { don_set, don } = use_donation();
  const [prompt, set_prompt] = useState<IPrompt>();
  // where a grant that has already been recommended ended up. set the moment
  // the money moves, not when the trip to the receipt is declared lost: what
  // comes between is up to nine seconds of a panel that looks exactly like one
  // nothing happened on, and the launcher may not be live for any of it.
  const [paid, set_paid] = useState<IDonationDest>();
  // ...and the trip never happened, so the way to the receipt has to be on the
  // panel: the prompt carrying it can be dismissed.
  const [stuck, set_stuck] = useState(false);
  const [script_ready, set_script_ready] = useState(false);

  const tipv = tip_val(props.tip_format, props.tip, +props.amount);
  const mfa = props.cover_processing_fee
    ? min_fee_allowance(tipv + +props.amount, PROCESSING_RATES.chariot)
    : 0;

  // refs for latest values so the chariot element doesn't re-mount on every change
  const props_ref = useRef(props);
  props_ref.current = props;
  const don_ref = useRef(don);
  don_ref.current = don;
  const don_set_ref = useRef(don_set);
  don_set_ref.current = don_set;
  const tipv_ref = useRef(tipv);
  tipv_ref.current = tipv;
  const mfa_ref = useRef(mfa);
  mfa_ref.current = mfa;
  const set_prompt_ref = useRef(set_prompt);
  set_prompt_ref.current = set_prompt;
  const redirect = use_donation_redirect();
  const redirect_ref = useRef(redirect);
  redirect_ref.current = redirect;

  // load chariot CDN script
  useEffect(() => {
    if (document.querySelector(`script[src="${CDN_SRC}"]`)) {
      set_script_ready(true);
      return;
    }
    const script = document.createElement("script");
    script.src = CDN_SRC;
    script.onload = () => set_script_ready(true);
    document.head.appendChild(script);
    return () => {
      script.onload = null;
    };
  }, []);

  const container_ref = useRef<HTMLDivElement>(null);

  // mount chariot-connect element
  useEffect(() => {
    const container = container_ref.current;
    if (!container || !script_ready) return;

    const el = document.createElement("chariot-connect") as HTMLElement & {
      onDonationRequest: (cb: () => Promise<unknown>) => void;
    };
    el.setAttribute("cid", chariot_connect_id);
    el.setAttribute("theme", "LightBlueTheme");

    const on_donation_request = async () => {
      const p = props_ref.current;
      const tv = tipv_ref.current;
      const fee = mfa_ref.current;
      const total = +p.amount + tv + fee;
      const amnt: IAmount = {
        base: +p.amount,
        tip: tv,
        fee_allowance: fee,
      };
      const metadata = {
        don_id: crypto.randomUUID(),
        amount: amnt,
      } satisfies ChariotMetadata;

      return {
        amount: to_atomic(total, [2, 2]),
        metadata,
      };
    };

    // https://givechariot.readme.io/reference/integrating-connect#pre-populate-data-into-your-connect-session
    const on_init = () => {
      el.onDonationRequest(async () => on_donation_request());
    };
    el.addEventListener("CHARIOT_INIT", on_init);

    // see https://givechariot.readme.io/reference/integrating-connect#capture-your-grant-intent
    const on_success = async (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const { grantIntent, workflowSessionId, user: grantor } = detail;
      const m: ChariotMetadata = grantIntent.metadata;
      const d = don_ref.current;

      try {
        // stays up until the browser leaves or the redirect reports it never
        // did — this used to clear the moment the intent was recorded, which
        // handed the donor a panel that looks untouched while the trip to the
        // receipt was still being attempted.
        set_prompt_ref.current({
          type: "loading",
          children: "Processing payment",
          isDismissable: false,
        });

        /** user may input amount different from our donate form */
        const parts = partition(m.amount);
        const grant_amount: number = grantIntent.amount / 100;
        const adj = parts(grant_amount);

        //reflect adjustment to state
        don_set_ref.current((x) => ({
          ...x,
          method: "daf",
          daf: {
            type: "daf",
            step: "checkout",
            fv: {
              ...props_ref.current,
              ...tip_from_val(adj.tip, adj.base),
            },
          },
        }));

        const { postalCode, line1, line2, city, state } = grantor.address;
        const addr_street = [line1, line2].filter(Boolean).join(", ");

        const addr: IDonorAddress = {
          street: addr_street,
          city,
          state,
          zip_code: postalCode,
        };

        const intent: IDonationIntent = {
          via: "chariot",
          via_extra: workflowSessionId,
          frequency: "one-time",
          currency: usd_option.code,
          amount: adj,
          to_id: d.recipient.id,
          donor: {
            title: "",
            email: grantor.email,
            first_name: grantor.firstName,
            last_name: grantor.lastName,
            company_name: "",
            address: addr,
          },
          source: d.source,
        };

        if (d.program) intent.program = d.program;
        if (d.config?.id) intent.form_id = d.config.id;

        const res = await fetch(href("/api/donation-intents"), {
          method: "POST",
          body: JSON.stringify(intent),
        });
        if (!res.ok) throw await res.text();
        const { id } = await res.json();

        const dest = donation_return_url({
          donation_id: id,
          base_url: d.base_url,
          success_redirect: d.config?.success_redirect,
          amount: grant_amount,
          currency: usd_option.code,
          payment_method: "daf",
          donor_name: [grantor.firstName, grantor.lastName],
        });

        // the grant is recommended and irreversible from here. the launcher
        // goes dead now — every path below is us trying to reach the receipt,
        // and none of them may leave a second grant one click away.
        set_paid(dest);

        redirect_ref.current({
          dest,
          form_id: d.config?.id,
          parent_origin: d.config?.parent_origin,
          on_stuck: () => {
            // the panel keeps saying it after the modal is gone
            set_stuck(true);
            set_prompt_ref.current(stuck_prompt(dest));
          },
        });
      } catch (err) {
        set_prompt_ref.current(
          error_prompt(err, { context: "processing donation" })
        );
      }
    };
    el.addEventListener("CHARIOT_SUCCESS", on_success);

    container.appendChild(el);
    return () => {
      el.removeEventListener("CHARIOT_INIT", on_init);
      el.removeEventListener("CHARIOT_SUCCESS", on_success);
      container.removeChild(el);
    };
  }, [script_ready]);

  return (
    <Summary
      classes="group grid content-start p-4 @xl/steps:p-8 [&_#connectContainer]:mt-8"
      on_back={() => to_step("daf", props, "form", don_set)}
      Amount={currency(usd_option)}
      amount={+props.amount}
      fee_allowance={mfa}
      frequency="one-time"
      tip={tipv ? { value: tipv, charity_name: don.recipient.name } : undefined}
    >
      {/* the grant is recommended, so the launcher goes dead — one more click
          here is a second real grant, of real money, out of the donor's fund.
          it goes dead in place rather than away: chariot's element owns a
          session whose modal renders into `document.body`, so unmounting it is
          the one move that could strand a sheet the donor still has open.
          `inert` shuts out pointer and keyboard both, and reaches into the
          shadow root the button lives in — `pointer-events-none` would leave
          it tabbable. */}
      <div
        ref={container_ref}
        inert={!!paid}
        className={paid ? "opacity-50" : undefined}
      >
        {!script_ready && <ContentLoader className="h-12 mt-4 block" />}
      </div>
      <ContentLoader className="h-12 mt-4 block group-has-[chariot-connect]:hidden" />
      {stuck && paid && (
        <StuckMsg dest={paid} classes="mt-4 text-sm text-gray-11" />
      )}
      <DonationTerms
        endowName={don.recipient.name}
        classes="border-t mt-5 pt-4 "
      />
      {prompt && <Prompt {...prompt} onClose={() => set_prompt(undefined)} />}
    </Summary>
  );
}
