import {
  type Components,
  loadCoreSdkScript,
  type PayPalV6Namespace,
  type SdkInstance,
} from "@paypal/paypal-js/sdk-v6";
import { useEffect, useRef } from "react";
import { href } from "react-router";
import { paypal_client_id, stage } from "#/constants/env";
import { donor_fv_init, type IDonationIntent } from "@/donations/schema";
import { report_error } from "@/errors/report";
import { use_donation } from "../context";
import type { IPayPalExpress } from "./stripe/use-rhf";

interface Props extends IPayPalExpress {
  on_error: (msg: string) => void;
  validate: () => Promise<boolean>;
  classes?: string;
}

// v6 environment — required by loadCoreSdkScript (no silent sandbox default)
const PP_ENV: "production" | "sandbox" =
  stage === "production" ? "production" : "sandbox";

const COMPONENTS = [
  "paypal-payments",
  "paypal-subscriptions",
  "venmo-payments",
] as const satisfies readonly Components[];
type Sdk = SdkInstance<typeof COMPONENTS>;

// cache the namespace + sdk instance across mounts. v6 no longer carries
// currency in the script URL, so we don't re-init when currency changes.
let _ns: Promise<PayPalV6Namespace | null> | null = null;
let _sdk: Promise<Sdk> | null = null;
const get_sdk = (): Promise<Sdk> => {
  if (_sdk) return _sdk;
  if (!_ns) _ns = loadCoreSdkScript({ environment: PP_ENV });
  const sdk = _ns.then((ns) => {
    if (!ns) throw new Error("paypal v6 namespace failed to load");
    return ns.createInstance({
      clientId: paypal_client_id,
      components: COMPONENTS,
    });
  });
  // reset on failure so the next mount can retry — a transient network
  // / csp blip at first load shouldn't poison the page for the whole session.
  sdk.catch(() => {
    if (_sdk === sdk) {
      _sdk = null;
      _ns = null;
    }
  });
  _sdk = sdk;
  return sdk;
};

export function Paypal({ classes = "", on_error, validate, ...p }: Props) {
  const { don } = use_donation();
  const container_ref = useRef<HTMLDivElement>(null);

  const { currency, frequency, is_partial } = p;
  const is_recurring = frequency !== "one-time";

  // refs for values read at call-time so the effect only re-runs on flow-shape
  // changes (currency / one-time vs recurring), not on every form field edit.
  const props_ref = useRef(p);
  props_ref.current = p;
  const don_ref = useRef(don);
  don_ref.current = don;
  const on_error_ref = useRef(on_error);
  on_error_ref.current = on_error;

  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | null = null;

    const init = async () => {
      const sdk = await get_sdk();
      if (!mounted || !container_ref.current) return;

      // v6 eligibility check replaces v5 enable/disable-funding URL params
      const methods = await sdk.findEligibleMethods({
        currencyCode: currency,
        paymentFlow: is_recurring ? "RECURRING_PAYMENT" : "ONE_TIME_PAYMENT",
      });
      if (!mounted || !container_ref.current) return;

      const pp_eligible = methods.isEligible("paypal");
      // venmo is us-only and one-time only (no subscription support)
      const vm_eligible = !is_recurring && methods.isEligible("venmo");

      if (!pp_eligible && !vm_eligible) {
        return on_error_ref.current(
          `PayPal not available for ${currency.toUpperCase()}`
        );
      }

      // tracks don_id from intent creation for server-side capture
      let don_id_ref = "";

      const create_intent = async (): Promise<string> => {
        const { amnt, tip, fee_allowance, frequency } = props_ref.current;
        const d = don_ref.current;
        const intent: IDonationIntent = {
          frequency,
          amount: { base: amnt, tip, fee_allowance },
          currency,
          donor: donor_fv_init,
          via: "paypal",
          via_extra: "",
          to_id: d.recipient.id,
          source: d.source,
        };
        if (d.program) intent.program = d.program;
        if (d.config?.id) intent.form_id = d.config.id;

        const res = await fetch(href("/api/donation-intents"), {
          method: "POST",
          body: JSON.stringify(intent),
        });
        if (!res.ok) throw res;
        const { tx_id, don_id } = await res.json();
        don_id_ref = don_id ?? "";
        return tx_id;
      };

      const build_redirect_url = (
        onhold_id: string,
        extra_params?: Record<string, string>
      ) => {
        const d = don_ref.current;
        const { amnt, tip, fee_allowance } = props_ref.current;
        const total = amnt + tip + fee_allowance;
        const custom_redirect = d.config?.success_redirect;
        const url = custom_redirect
          ? new URL(custom_redirect)
          : new URL(
              `${d.base_url}${href("/donations/:id", { id: onhold_id })}`
            );

        if (custom_redirect) {
          url.searchParams.set("donation_amount", total.toString());
          url.searchParams.set("donation_currency", currency);
          for (const [key, value] of Object.entries(extra_params ?? {})) {
            url.searchParams.set(key, value);
          }
        }
        return url.toString();
      };

      const do_redirect = (url: string) => {
        const d = don_ref.current;
        if (window.self !== window.top) {
          window.parent.postMessage(
            { type: "redirect", redirect_url: url, form_id: d.config?.id },
            "*"
          );
        } else {
          window.location.assign(url);
        }
      };

      const on_session_error = (err: unknown) => {
        // session.start can fail for CSP / popup-blocked / network reasons.
        // surface a friendly fallback so donor can try another method.
        console.warn("paypal session error", err);
        on_error_ref.current(
          "PayPal failed — please try another payment method."
        );
      };

      // shared one-time approval: PATCH our server to capture, then redirect.
      // works for both paypal and venmo (server reads payment_source.{paypal|venmo})
      // own try/catch — paypal v6 may not forward post-approval rejections to
      // session onError, and silent failure here means a donor authorized a
      // real payment with no confirmation. always surface something.
      const on_one_time_approve = async (data: { orderId: string }) => {
        try {
          const res = await fetch(href("/api/donation-intents"), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_id: data.orderId,
              don_id: don_id_ref,
            }),
          });
          if (!res.ok) return on_error_ref.current("Failed to capture payment");

          const { purchase_units, payment_source = {} } = await res.json();
          const ps_id = Object.keys(payment_source)[0] || "paypal";
          const ps = payment_source.paypal || payment_source.venmo;
          const onhold_id = purchase_units?.[0]?.custom_id;
          if (!onhold_id)
            return on_error_ref.current("Missing order information");

          const extra: Record<string, string> = { payment_method: ps_id };
          if (ps?.name?.full_name) extra.donor_name = ps.name.full_name;
          do_redirect(build_redirect_url(onhold_id, extra));
        } catch (err) {
          report_error(err);
          on_error_ref.current(
            "Failed to capture payment — please contact support."
          );
        }
      };

      const mounted_btns: HTMLElement[] = [];

      if (pp_eligible) {
        const btn = document.createElement("paypal-button");
        btn.className = "paypal-gold w-full";
        btn.addEventListener("click", () => {
          if (is_recurring) {
            const session = sdk.createPayPalSubscriptionPaymentSession({
              onApprove: async () => {
                // server set custom_id=don.id on subscription; donation row
                // enriched from BILLING.SUBSCRIPTION.ACTIVATED webhook.
                do_redirect(
                  build_redirect_url(don_id_ref, { payment_method: "paypal" })
                );
              },
              onError: on_session_error,
            });
            session
              .start(
                { presentationMode: "auto" },
                create_intent().then((subscriptionId) => ({ subscriptionId }))
              )
              .catch(on_session_error);
          } else {
            const session = sdk.createPayPalOneTimePaymentSession({
              onApprove: on_one_time_approve,
              onError: on_session_error,
            });
            session
              .start(
                { presentationMode: "auto" },
                create_intent().then((orderId) => ({ orderId }))
              )
              .catch(on_session_error);
          }
        });
        container_ref.current.appendChild(btn);
        mounted_btns.push(btn);
      }

      if (vm_eligible) {
        const btn = document.createElement("venmo-button");
        btn.className = "venmo-blue w-full";
        btn.addEventListener("click", () => {
          const session = sdk.createVenmoOneTimePaymentSession({
            onApprove: on_one_time_approve,
            onError: on_session_error,
          });
          session
            .start(
              { presentationMode: "auto" },
              create_intent().then((orderId) => ({ orderId }))
            )
            .catch(on_session_error);
        });
        container_ref.current.appendChild(btn);
        mounted_btns.push(btn);
      }

      cleanup = () => {
        for (const b of mounted_btns) b.remove();
      };
    };

    init().catch((err) => {
      // loadCoreSdkScript / createInstance / findEligibleMethods can fail for
      // CSP / extension / network reasons. surface a friendly fallback.
      report_error(err);
      if (mounted) {
        on_error_ref.current(
          "PayPal failed to load — please try another payment method."
        );
      }
    });

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [currency, is_recurring]);

  return (
    <div className={`relative isolate ${classes}`}>
      {is_partial && (
        <button
          type="button"
          data-testid="paypal-gate"
          className="absolute inset-0 z-10 cursor-pointer pointer-events-auto"
          onClick={() => validate()}
        />
      )}
      <div
        ref={container_ref}
        className={`flex flex-col gap-2 ${is_partial ? "pointer-events-none" : ""}`}
        style={{
          // v6 web component css vars per docs
          ["--paypal-button-border-radius" as string]: "4px",
        }}
      />
    </div>
  );
}
