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
import type { IDonationDest } from "../../common/return-url";
import { StuckMsg, stuck_prompt } from "../../common/stuck-prompt";
import { TipField } from "../../common/tip-field";
import { tip_handlers } from "../../common/tip-handlers";
import { use_donation } from "../../context";
import { type TMethodState, to_step } from "../../types";
import { Paypal } from "../paypal";
import { ExpressCheckout } from "./express-checkout";
import { use_rhf } from "./use-rhf";

interface IUnavailable {
  /** the flow shape the rail reported unavailable for */
  flow: string;
  /** what to tell the donor in the block's place */
  msg: string;
}

export function Form(props: TMethodState<"stripe">) {
  const [prompt, set_prompt] = useState<IPrompt>();
  // the paypal flow shape reported unavailable, if any, and why. keyed by flow
  // rather than a boolean so switching currency or frequency re-offers the
  // block instead of hiding it for the rest of the mount.
  const [pp_unavailable, set_pp_unavailable] = useState<IUnavailable>();
  // same for the stripe rail, tracked separately: the two rails fail
  // independently (paypal adblocked while apple/google pay is fine, or the
  // reverse), so one going quiet must never take the other down with it.
  const [sx_unavailable, set_sx_unavailable] = useState<IUnavailable>();
  // a donation on one of the express rails went through. set when the charge
  // lands, not when the trip to the receipt is declared lost: between the two
  // is up to nine seconds of a form that looks exactly like one nothing
  // happened on, and every way to pay is shut for all of it. deliberately not
  // a destination — the click gate only refuses to *open* a rail, so a session
  // the donor already had open can still land after this, and two charges
  // would fight over one variable.
  const [paid, set_paid] = useState(false);
  // ...and where the one whose trip never happened ended up. carried per
  // failure rather than shared with `paid`, so the way out always points at
  // the donation that actually needs it. the prompt saying so can be
  // dismissed, so it has to survive on the form too.
  const [stuck, set_stuck] = useState<IDonationDest>();
  const { don_set, don } = use_donation();

  const on_stuck = (dest: IDonationDest) => {
    set_stuck(dest);
    set_prompt(stuck_prompt(dest));
  };

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

  const pp_flow = rhf.paypal_express
    ? `${rhf.paypal_express.currency}-${rhf.paypal_express.frequency}`
    : "";

  const sx_flow = rhf.stripe_express
    ? `${rhf.stripe_express.currency}-${rhf.stripe_express.frequency}`
    : "";

  /**
   * what stands where an express block would have been. a rail that can't be
   * offered is never a modal: the failure is usually persistent (an adblocked
   * sdk fails the same way on every retry), and a prompt unmounts the rail,
   * whose remount re-fails and re-prompts — on /donate/:id that leaves the
   * donor unable to reach the other tabs. where nobody came to donate, it just
   * isn't offered; where they did, say so quietly and leave the page alone.
   */
  const unavailable = (u: IUnavailable | undefined, flow: string) => {
    if (u?.flow !== flow) return null;
    if (don.hide_unavailable_express) return null;
    return (
      <p role="status" className="mt-4 text-xs text-muted-fg">
        {u.msg}
      </p>
    );
  };

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
      {/* nothing here unmounts a rail to stop it being used: a prompt raised
          mid-payment, or a `paid` that lands while the donor's sheet is still
          closing, would take the wallet element and its <Elements> wrapper —
          or paypal's live session — out from under them. both rails refuse a
          second payment at their own click gate instead, where the sheet has
          not opened yet and there is nothing to strand. */}
      {rhf.stripe_express && sx_unavailable?.flow !== sx_flow && (
        <ExpressCheckout
          paid={paid}
          on_error={(msg) =>
            set_prompt({ type: "error", children: <p>{msg}</p> })
          }
          on_paid={() => set_paid(true)}
          on_stuck={on_stuck}
          // nothing has been paid yet and no donor action is pending: record
          // it and let `unavailable` decide what stands in the block's place.
          // never a prompt — see the note there.
          on_unavailable={(msg) => set_sx_unavailable({ flow: sx_flow, msg })}
          validate={async () => {
            const valid = await rhf.trigger(["amount", "frequency"]);
            if (!valid) rhf.setFocus("amount");
            return valid;
          }}
          classes={`mt-4 ${paid ? "opacity-50" : ""}`}
          {...rhf.stripe_express}
        />
      )}
      {!prompt && unavailable(sx_unavailable, sx_flow)}
      {rhf.paypal_express && pp_unavailable?.flow !== pp_flow && (
        <Paypal
          {...rhf.paypal_express}
          classes={paid ? "opacity-50" : ""}
          paid={paid}
          validate={async () => {
            const valid = await rhf.trigger(["amount", "frequency"]);
            if (!valid) rhf.setFocus("amount");
            return valid;
          }}
          on_error={(x) => set_prompt({ type: "error", children: x })}
          on_paid={() => set_paid(true)}
          on_stuck={on_stuck}
          on_unavailable={(msg) => set_pp_unavailable({ flow: pp_flow, msg })}
        />
      )}
      {!prompt && unavailable(pp_unavailable, pp_flow)}
      {stuck && <StuckMsg dest={stuck} classes="mt-4 text-sm text-muted-fg" />}

      <button
        disabled={
          paid ||
          currency.isLoading ||
          currency.isValidating ||
          !!currency.error
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
