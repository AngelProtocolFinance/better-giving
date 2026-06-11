import type {
  PayPalButtonOnApprove,
  PayPalButtonsComponent,
  PayPalButtonsComponentOptions,
} from "@paypal/paypal-js";
import { useEffect, useRef } from "react";
import { href } from "react-router";
import { paypal_client_id } from "#/constants/env";
import { donor_fv_init, type IDonationIntent } from "@/donations/schema";
import { report_error } from "@/errors/report";
import { use_donation } from "../context";
import type { IPayPalExpress } from "./stripe/use-rhf";

interface Props extends IPayPalExpress {
  on_error: (msg: string) => void;
  validate: () => Promise<boolean>;
  classes?: string;
}

export function Paypal({ classes = "", on_error, validate, ...p }: Props) {
  const { don } = use_donation();
  const container_ref = useRef<HTMLDivElement>(null);

  const { currency, frequency, is_partial } = p;
  const is_recurring = frequency !== "one-time";

  // refs for values read at call-time so the effect only re-runs on SDK config changes
  const props_ref = useRef(p);
  props_ref.current = p;
  const don_ref = useRef(don);
  don_ref.current = don;
  const on_error_ref = useRef(on_error);
  on_error_ref.current = on_error;

  useEffect(() => {
    let mounted = true;
    let buttons_instance: PayPalButtonsComponent | null = null;

    const init = async () => {
      const { loadScript } = await import("@paypal/paypal-js");
      const paypal = await loadScript({
        clientId: paypal_client_id,
        currency,
        disableFunding: ["card", "paylater"],
        enableFunding: is_recurring ? ["paypal"] : ["venmo", "paypal"],
        vault: is_recurring,
        intent: is_recurring ? "subscription" : "capture",
      });

      if (!mounted || !paypal?.Buttons || !container_ref.current) return;

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

      const handle_redirect = (
        url: string,
        actions: { redirect: (url: string) => void }
      ) => {
        const d = don_ref.current;
        if (window.self !== window.top) {
          window.parent.postMessage(
            { type: "redirect", redirect_url: url, form_id: d.config?.id },
            "*"
          );
        } else {
          actions.redirect(url);
        }
      };

      const on_approve: PayPalButtonOnApprove = async (data, actions) => {
        if (actions.order) {
          const res = await fetch(href("/api/donation-intents"), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_id: data.orderID,
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

          const extra_params: Record<string, string> = {
            payment_method: ps_id,
          };
          if (ps?.name?.full_name) extra_params.donor_name = ps.name.full_name;

          const url = build_redirect_url(onhold_id, extra_params);
          return handle_redirect(url, actions);
        }

        if (actions.subscription) {
          const sub = await actions.subscription.get();
          if ("custom_id" in sub) {
            const url = build_redirect_url(sub.custom_id as string, {
              payment_method: "paypal",
            });
            return handle_redirect(url, actions);
          }
        }
      };

      const opts: PayPalButtonsComponentOptions = {
        onApprove: on_approve,
        style: {
          layout: "vertical",
          shape: "rect",
          borderRadius: 4,
          tagline: false,
        },
        ...(is_recurring
          ? { createSubscription: create_intent }
          : { createOrder: create_intent }),
      };

      const btn_container = document.createElement("div");
      btn_container.id = "paypal-button-container";
      container_ref.current.appendChild(btn_container);

      buttons_instance = paypal.Buttons(opts);
      await buttons_instance.render("#paypal-button-container");
    };

    init().catch(report_error);

    return () => {
      mounted = false;
      if (buttons_instance) {
        buttons_instance.close().catch(() => {});
      }
      const btn_container = document.getElementById("paypal-button-container");
      btn_container?.remove();
    };
    // only re-init when SDK config changes (currency/recurring affect the loaded script)
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
        className={is_partial ? "pointer-events-none" : ""}
      />
    </div>
  );
}
