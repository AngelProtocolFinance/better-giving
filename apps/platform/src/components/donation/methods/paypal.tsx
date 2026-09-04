import type {
  Components,
  PayPalV6Namespace,
  SdkInstance,
} from "@paypal/paypal-js/sdk-v6";
import { useEffect, useRef } from "react";
import { href } from "react-router";
import { paypal_client_id, stage } from "#/constants/env";
import { donor_fv_init, type IDonationIntent } from "@/donations/schema";
import { report_degraded, report_error } from "@/errors/report";
import { use_donation_redirect } from "../common/redirect";
import { retry_once } from "../common/retry";
import { donation_return_url, type IDonationDest } from "../common/return-url";
import { use_donation } from "../context";
import type { IPayPalExpress } from "./stripe/use-rhf";

interface Props extends IPayPalExpress {
  on_error: (msg: string) => void;
  /**
   * the block can't be offered at all — sdk failed to load, or no funding
   * method is eligible for this currency/flow. raised before the donor has
   * touched anything, so the caller decides whether it's worth interrupting
   * them. falls back to `on_error` when the caller doesn't handle it.
   * everything that goes wrong *during* a payment stays on `on_error`.
   */
  on_unavailable?: (msg: string) => void;
  /**
   * the payment went through. raised the moment it does, before the trip to
   * the thank-you page is even attempted — that trip can take up to nine
   * seconds to fail, and no rail may take a second payment during it.
   */
  on_paid?: (dest: IDonationDest) => void;
  /**
   * the payment went through but the browser never left for the thank-you
   * page. not an error — the money moved — so the caller says so and hands
   * the donor the destination this passes back.
   */
  on_stuck?: (dest: IDonationDest) => void;
  /** this donor has already been charged on one of the rails, so the buttons
   * stay put but no longer open a session. */
  paid?: boolean;
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

// cache the namespace + sdk instance across mounts. v6 does not carry
// currency in the script URL, so we don't re-init when currency changes.
let _ns: Promise<PayPalV6Namespace | null> | null = null;
let _sdk: Promise<Sdk> | null = null;
const get_sdk = (): Promise<Sdk> => {
  if (_sdk) return _sdk;
  // dynamic import: @vercel/nft still mis-traces the `./sdk-v6` subpath and
  // resolves a static SSR import to the v5 entry on Vercel — even on 10.0.3,
  // which added the `default` export condition (that bump did NOT fix it; see
  // the reverted #61). crashes the function with "does not provide an export
  // named 'loadCoreSdkScript'". browser bundle is fine; only SSR needs gating.
  if (!_ns)
    _ns = import("@paypal/paypal-js/sdk-v6").then((m) =>
      m.loadCoreSdkScript({ environment: PP_ENV })
    );
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

export function Paypal({
  classes = "",
  on_error,
  on_unavailable,
  on_paid,
  on_stuck,
  paid,
  validate,
  ...p
}: Props) {
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
  const on_unavailable_ref = useRef(on_unavailable ?? on_error);
  on_unavailable_ref.current = on_unavailable ?? on_error;
  const on_paid_ref = useRef(on_paid);
  on_paid_ref.current = on_paid;
  const on_stuck_ref = useRef(on_stuck);
  on_stuck_ref.current = on_stuck;
  // read at click time: the buttons are mounted once, in an effect keyed on
  // flow shape, so a prop change must reach them without a remount.
  const paid_ref = useRef(paid);
  paid_ref.current = paid;
  const redirect = use_donation_redirect();
  const redirect_ref = useRef(redirect);
  redirect_ref.current = redirect;

  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | null = null;

    const init = async () => {
      // get_sdk clears its cache on failure, so the second call re-runs the
      // whole chain — chunk import, script tag, createInstance — rather than
      // handing back the first attempt's rejection. same for loadCoreSdkScript,
      // which only reuses a <script> still marked pending.
      const sdk = await retry_once(get_sdk);
      if (!mounted || !container_ref.current) return;

      // v6 eligibility check — funding methods are not chosen by url params
      const methods = await retry_once(() =>
        sdk.findEligibleMethods({
          currencyCode: currency,
          paymentFlow: is_recurring ? "RECURRING_PAYMENT" : "ONE_TIME_PAYMENT",
        })
      );
      if (!mounted || !container_ref.current) return;

      const pp_eligible = methods.isEligible("paypal");
      // venmo is us-only and one-time only (no subscription support)
      const vm_eligible = !is_recurring && methods.isEligible("venmo");

      if (!pp_eligible && !vm_eligible) {
        return on_unavailable_ref.current(
          `PayPal not available for ${currency.toUpperCase()}`
        );
      }

      // returns both ids so each click can capture its own (no shared mutable
      // state — a rapid double-click must not let intent B's don_id overwrite
      // intent A's and silently misroute capture).
      const create_intent = async (): Promise<{
        tx_id: string;
        don_id: string;
      }> => {
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
        return { tx_id, don_id: don_id ?? "" };
      };

      const build_redirect_url = (
        onhold_id: string,
        payment_method: string,
        donor_name?: string
      ) => {
        const d = don_ref.current;
        const { amnt, tip, fee_allowance } = props_ref.current;
        return donation_return_url({
          donation_id: onhold_id,
          base_url: d.base_url,
          success_redirect: d.config?.success_redirect,
          amount: amnt + tip + fee_allowance,
          currency,
          payment_method,
          donor_name: [donor_name],
        });
      };

      const do_redirect = (dest: IDonationDest) => {
        const d = don_ref.current;
        // charged. said before the redirect is attempted rather than after it
        // gives up — the popup has closed by now and the form behind it still
        // looks untouched.
        on_paid_ref.current?.(dest);
        redirect_ref.current({
          dest,
          form_id: d.config?.id,
          parent_origin: d.config?.parent_origin,
          on_stuck: () => on_stuck_ref.current?.(dest),
        });
      };

      const on_session_error = (err: unknown) => {
        // session.start can fail for CSP / popup-blocked / network reasons.
        // surface a friendly fallback so donor can try another method.
        console.warn("paypal session error", err);
        on_error_ref.current(
          "PayPal failed — please try another payment method."
        );
      };

      // one-time approval: PATCH our server to capture, then redirect.
      // works for both paypal and venmo (server reads payment_source.{paypal|venmo}).
      // own try/catch — paypal v6 may not forward post-approval rejections to
      // session onError, and silent failure here means a donor authorized a
      // real payment with no confirmation. always surface something.
      // don_id is captured per-click via the intent promise, not shared state.
      const handle_one_time_approve = async (
        don_id: string,
        order_id: string
      ) => {
        try {
          const res = await fetch(href("/api/donation-intents"), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id, don_id }),
          });
          if (!res.ok) return on_error_ref.current("Failed to capture payment");

          const { purchase_units, payment_source = {} } = await res.json();
          const ps_id = Object.keys(payment_source)[0] || "paypal";
          const ps = payment_source.paypal || payment_source.venmo;
          const onhold_id = purchase_units?.[0]?.custom_id;
          if (!onhold_id)
            return on_error_ref.current("Missing order information");

          do_redirect(
            build_redirect_url(onhold_id, ps_id, ps?.name?.full_name)
          );
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
          // already charged on some rail: no session, and — just as important
          // — no intent created for one that will never be paid.
          if (paid_ref.current) return;
          // each click owns its intent_promise — no shared mutable don_id.
          const intent_promise = create_intent();
          if (is_recurring) {
            const session = sdk.createPayPalSubscriptionPaymentSession({
              onApprove: async () => {
                try {
                  // server set custom_id=don.id on subscription; donation row
                  // enriched from BILLING.SUBSCRIPTION.ACTIVATED webhook.
                  const { don_id } = await intent_promise;
                  do_redirect(build_redirect_url(don_id, "paypal"));
                } catch (err) {
                  report_error(err);
                  on_error_ref.current(
                    "Subscription failed — please contact support."
                  );
                }
              },
              onError: on_session_error,
            });
            session
              .start(
                { presentationMode: "auto" },
                intent_promise.then(({ tx_id }) => ({ subscriptionId: tx_id }))
              )
              .catch(on_session_error);
          } else {
            const session = sdk.createPayPalOneTimePaymentSession({
              onApprove: async ({ orderId }) => {
                const { don_id } = await intent_promise;
                await handle_one_time_approve(don_id, orderId);
              },
              onError: on_session_error,
            });
            session
              .start(
                { presentationMode: "auto" },
                intent_promise.then(({ tx_id }) => ({ orderId: tx_id }))
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
          if (paid_ref.current) return;
          const intent_promise = create_intent();
          const session = sdk.createVenmoOneTimePaymentSession({
            onApprove: async ({ orderId }) => {
              const { don_id } = await intent_promise;
              await handle_one_time_approve(don_id, orderId);
            },
            onError: on_session_error,
          });
          session
            .start(
              { presentationMode: "auto" },
              intent_promise.then(({ tx_id }) => ({ orderId: tx_id }))
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
      // CSP / extension / network reasons. surface a friendly fallback. the sdk
      // discards the upstream cause, so a donor who can't reach paypal.com and
      // a paypal incident are indistinguishable here — degraded either way, and
      // an incident shows up as a rate change rather than one loud event.
      report_degraded(err);
      if (mounted) {
        on_unavailable_ref.current(
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
        // a shield over the sdk's own buttons, not a control: its whole job is
        // to swallow a click on an unfilled form and run validation, so it is
        // out of the tab order and out of the a11y tree. a keyboard donor
        // reaches the form fields it is complaining about, never this.
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
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
