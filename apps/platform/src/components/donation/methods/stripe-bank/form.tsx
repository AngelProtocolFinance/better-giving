import {
  Combo,
  Form as FieldSet,
  type IPrompt,
  Prompt,
} from "@better-giving/ui";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { href } from "react-router";
import use_swr from "swr/immutable";
import type { ICurrenciesFv } from "#/types/currency";
import { ru_vdec } from "@/helpers/decimal";
import { btn_disp, TokenField } from "../../../token-field";
import { usd_option } from "../../common/constants";
import { CpfToggle } from "../../common/cpf-toggle";
import { Frequency, freqs_shown } from "../../common/frequency";
import { Incrementers } from "../../common/incrementers";
import { TipField } from "../../common/tip-field";
import { tip_handlers } from "../../common/tip-handlers";
import { use_donation } from "../../context";
import { type TMethodState, to_step } from "../../types";
import { use_rhf } from "../stripe/use-rhf";

// us_bank_account → USD, acss_debit → CAD
const bank_currencies = new Set(["USD", "CAD"]);

export function Form(props: TMethodState<"stripe_bank">) {
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

  const tip = tip_handlers({
    format: rhf.tip_format,
    set_value: (v) => rhf.setValue("tip", v),
    set_focus: () => rhf.setFocus("tip"),
    str: (pct) => {
      const [c, amnt] = rhf.getValues(["currency", "amount"]);
      if (!amnt) return "";
      return ru_vdec((pct / 100) * +amnt, 1 / c.rate);
    },
  });

  const currency = use_swr(
    href("/api/currencies"),
    (path) => fetch(path).then<ICurrenciesFv>((res) => res.json()),
    {
      onSuccess: (data) => {
        if (!data.pref || !bank_currencies.has(data.pref.code)) return;
        rhf.currency.onChange(data.pref);

        const u1_usd_str = rhf.getValues("amount");
        const u2 = u1_usd_str ? +u1_usd_str * data.pref.rate : 0;
        const u2str = u2 ? ru_vdec(u2, 1 / data.pref.rate) : "";
        rhf.amount.onChange(u2str);
      },
    }
  );
  const opts = (currency.data?.all || []).filter((c) =>
    bank_currencies.has(c.code)
  );

  const freqs = freqs_shown(don.config?.freq_opts);

  // the popup portals to body, out of #donation-container, so it inherits none
  // of the tenant palette — re-apply on the far side what the shell reads.
  // --accent is the option row's highlight and --ring the scrollbar thumb;
  // #donation-container points --ring at --form-primary for the same reason.
  const popup_vars: Record<string, string | undefined> = {
    "--form-primary": don.config?.accent_primary,
    "--form-secondary": don.config?.accent_secondary,
    "--accent": don.config?.accent_secondary,
    "--ring": don.config?.accent_primary,
  };

  const combobox = (
    <Combo
      classes={{
        container: "has-placeholder-shown:w-34 w-22",
        // the box is TokenField's: this is the left cell of the
        // field-input-container it shares with the amount input, and the focus
        // ring is that container's too (`:has(input:focus)`) — a field box here
        // would draw a second one inside it.
        input: "w-full text-sm bg-transparent px-4 py-3.5 focus:outline-hidden",
      }}
      disabled={currency.isLoading || currency.isValidating}
      adornment={(open) => btn_disp(open, undefined)}
      item_key={(t) => t.code}
      item_text={(t) => t.code}
      placeholder="Currency"
      options={opts}
      // the control is as narrow as a currency code; the list is not
      popup_width="w-56"
      indicator={<CheckIcon size={14} className="text-gray-11" />}
      popup_vars={popup_vars}
      value={rhf.currency.value}
      // the schema has no empty currency, and the seam only emits undefined
      // from a clear trigger this control doesn't offer
      on_change={(t) => {
        if (t) rhf.currency.onChange(t);
      }}
    />
  );

  return (
    <FieldSet
      onSubmit={rhf.handleSubmit((fv) =>
        to_step("stripe_bank", fv, "donor", don_set)
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
        on_change={(x) => rhf.amount.onChange(x)}
        error={rhf.errors.amount?.message}
        label="Donation amount"
      />
      {rhf.currency.value.rate && (
        <Incrementers
          classes="-mt-1"
          disabled={currency.isLoading || currency.isValidating}
          on_increment={rhf.on_increment}
          code={rhf.currency.value.code}
          rate={rhf.currency.value.rate}
          increments={don.config?.increments}
          precision={0}
        />
      )}

      {don.recipient.hide_bg_tip ? null : (
        <TipField
          classes="mt-2"
          nudge={!!rhf.amount.value}
          checked={rhf.tip_format.value !== "none"}
          checked_changed={tip.checked_changed}
          tip_format={rhf.tip_format.value}
          tip_format_changed={tip.tip_format_changed}
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
                <span className="right-6 text-xs text-destructive-subtle-fg text-right absolute top-1/2 -translate-y-1/2 empty:hidden">
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

      <p className="text-xs text-gray-11">
        0.8% fee, capped at $5 — save vs. card (2.2% + $0.30)
      </p>

      <button
        disabled={
          currency.isLoading ||
          currency.isValidating ||
          !!currency.error ||
          rhf.isSubmitting
        }
        className="mt-auto btn btn-form-primary"
        type="submit"
      >
        Continue
      </button>
      {prompt && <Prompt {...prompt} onClose={() => set_prompt(undefined)} />}
    </FieldSet>
  );
}
