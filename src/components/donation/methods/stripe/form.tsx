import { Combobox } from "@ark-ui/react/combobox";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { href } from "react-router";
import use_swr from "swr/immutable";
import type { ICurrenciesFv } from "#/types/currency";
import { ru_vdec } from "@/helpers/decimal";
import { Form as FieldSet } from "../../../form";
import { type IPrompt, Prompt } from "../../../prompt";
import { btn_disp, TokenComboboxSync, TokenField } from "../../../token-field";
import { usd_option } from "../../common/constants";
import { CpfToggle } from "../../common/cpf-toggle";
import { Frequency, freqs_shown } from "../../common/frequency";
import { Incrementers } from "../../common/incrementers";
import { TipField } from "../../common/tip-field";
import { use_donation } from "../../context";
import { type TMethodState, to_step } from "../../types";
import { Paypal } from "../paypal";
import { ExpressCheckout } from "./express-checkout";
import { use_rhf } from "./use-rhf";

export function Form(props: TMethodState<"stripe">) {
  const [prompt, set_prompt] = useState<IPrompt>();
  const { don_set, don } = use_donation();

  const fv = props.fv || {
    amount: don.config?.stripe?.amount_usd || "",
    currency: usd_option,
    frequency: "one-time",
    tip: "",
    cover_processing_fee: false,
    tip_format: "none",
  };

  const rhf = use_rhf(fv);

  const currency = use_swr(
    href("/api/currencies"),
    (path) => fetch(path).then<ICurrenciesFv>((res) => res.json()),
    {
      // only runs once
      onSuccess: (data) => {
        if (!data.pref) return;
        rhf.currency.onChange(data.pref);

        // translate init usd amount to preferred currency
        const u1_usd_str = rhf.getValues("amount"); // init amount is in usd
        const u2 = u1_usd_str ? +u1_usd_str * data.pref.rate : 0;
        const u2str = u2 ? ru_vdec(u2, 1 / data.pref.rate) : "";
        rhf.amount.onChange(u2str);
      },
    }
  );
  const opts = currency.data?.all || [];

  const freqs = freqs_shown(don.config?.freq_opts);

  const combobox = (
    <TokenComboboxSync
      classes="has-placeholder-shown:w-34 w-22"
      disabled={currency.isLoading || currency.isValidating}
      btn_disp={(open) => btn_disp(open, undefined)}
      item_key={(t) => t.code}
      item_label={(t) => t.code}
      input_placeholder="Currency"
      items={opts}
      opt_disp={(t) => (
        <Combobox.Item
          key={t.code}
          className="w-full text-sm grid grid-cols-[1fr_auto] items-center p-2 hover:bg-form-secondary data-highlighted:bg-form-secondary data-[state=checked]:font-semibold"
          item={t}
        >
          {t.code}
          <Combobox.ItemIndicator className="text-muted-fg">
            <CheckIcon size={14} />
          </Combobox.ItemIndicator>
        </Combobox.Item>
      )}
      value={rhf.currency.value}
      // reapply to portaled
      opts_styles={{
        "--form-primary": don.config?.accent_primary,
        "--form-secondary": don.config?.accent_secondary,
      }}
      on_change={async (t) => rhf.currency.onChange(t)}
    />
  );

  return (
    <FieldSet
      onSubmit={rhf.handleSubmit((fv) =>
        to_step("stripe", fv, "donor", don_set)
      )}
      className="flex flex-col h-full gap-y-2"
    >
      {freqs && (
        <Frequency
          opts={freqs}
          value={rhf.frequency.value}
          onChange={rhf.frequency.onChange}
          error={rhf.errors.frequency?.message}
        />
      )}
      <TokenField
        ref={rhf.amount.ref}
        combobox={combobox}
        amount={rhf.amount.value}
        amount_usd={
          rhf.currency.value.code === "USD"
            ? 0
            : +rhf.amount.value / rhf.currency.value.rate
        }
        on_change={(x) => {
          rhf.amount.onChange(x);
          if (rhf.errors.amount) rhf.trigger("amount");
        }}
        error={rhf.errors.amount?.message}
        label="Donation amount"
      />
      {rhf.currency.value.rate ? (
        <Incrementers
          classes="-mt-1"
          disabled={currency.isLoading || currency.isValidating}
          on_increment={rhf.on_increment}
          code={rhf.currency.value.code}
          rate={rhf.currency.value.rate}
          increments={don.config?.increments}
          precision={0}
        />
      ) : null}

      {don.recipient.hide_bg_tip ? null : (
        <TipField
          classes="mt-2"
          nudge={!!rhf.amount.value}
          checked={rhf.tip_format.value !== "none"}
          checked_changed={(checked) => {
            if (checked) {
              rhf.tip_format.onChange("15");
            } else {
              rhf.tip_format.onChange("none");
              rhf.setValue("tip", "");
            }
          }}
          tip_format={rhf.tip_format.value}
          tip_format_changed={async (format) => {
            rhf.tip_format.onChange(format);
            if (format === "none") {
              return rhf.setValue("tip", "");
            }
            if (format === "custom") {
              await new Promise((r) => setTimeout(r, 50));
              return rhf.setFocus("tip");
            }

            const [c, amnt] = rhf.getValues(["currency", "amount"]);
            if (!amnt) return rhf.setValue("tip", "");

            const v = (+format / 100) * +amnt;
            rhf.setValue("tip", ru_vdec(v, 1 / c.rate));
          }}
          custom_tip={
            rhf.tip_format.value === "custom" ? (
              <div className="relative w-full flex items-baseline">
                <span className="font-bold text-2xs self-baseline text-form-primary">
                  {rhf.currency.value.code}
                </span>
                <input
                  {...rhf.register("tip")}
                  inputMode="decimal"
                  className="w-full text-sm pl-1 focus:outline-none"
                  placeholder="Enter contribution amount"
                  aria-invalid={!!rhf.errors.tip?.message}
                />
                <span className="right-6 text-xs text-destructive text-right absolute top-1/2 -translate-y-1/2 empty:hidden">
                  {rhf.errors.tip?.message}
                </span>
              </div>
            ) : undefined
          }
        />
      )}

      <CpfToggle
        classes="mt-1 mb-4"
        checked={rhf.cpf.value}
        checked_changed={(x) => rhf.cpf.onChange(x)}
      />
      {rhf.stripe_express && !prompt && (
        <ExpressCheckout
          on_error={(msg) =>
            set_prompt({ type: "error", children: <p>{msg}</p> })
          }
          validate={async () => {
            const valid = await rhf.trigger(["amount", "frequency"]);
            if (!valid) rhf.setFocus("amount");
            return valid;
          }}
          classes="mt-4"
          {...rhf.stripe_express}
        />
      )}
      {rhf.paypal_express && !prompt && (
        <Paypal
          {...rhf.paypal_express}
          validate={async () => {
            const valid = await rhf.trigger(["amount", "frequency"]);
            if (!valid) rhf.setFocus("amount");
            return valid;
          }}
          on_error={(x) => set_prompt({ type: "error", children: x })}
        />
      )}

      <button
        disabled={
          currency.isLoading || currency.isValidating || !!currency.error
        }
        className="mt-auto btn btn-form-primary"
        type="submit"
      >
        Continue with Card
      </button>
      {prompt && <Prompt {...prompt} onClose={() => set_prompt(undefined)} />}
    </FieldSet>
  );
}
