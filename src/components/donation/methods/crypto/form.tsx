import { Combobox } from "@base-ui/react/combobox";
import { chains, type IToken, is_custom } from "@better-giving/crypto";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { href } from "react-router";
import type { ITokenEstimate } from "#/types/api";
import { DONATION_INCREMENTS, logo_url } from "@/constants/common";
import { report_error } from "@/errors/report";
import { ru_vdec } from "@/helpers/decimal";
import {
  btn_disp,
  TokenCombobox,
  TokenField,
  type TTokenState,
} from "../../../token-field";
import { CpfToggle } from "../../common/cpf-toggle";
import { Incrementers } from "../../common/incrementers";
import { MethodBenefits } from "../../common/method-benefits";
import { TipField } from "../../common/tip-field";
import { use_donation } from "../../context";
import { type TMethodState, to_step } from "../../types";
import { use_rhf } from "./use-rhf";

async function search_tokens(
  q: string,
  signal: AbortSignal
): Promise<IToken[]> {
  const res = await fetch(`${href("/api/tokens")}?q=${encodeURIComponent(q)}`, {
    signal,
  });
  if (!res.ok) throw res;
  return res.json();
}

export function Form(props: TMethodState<"crypto">) {
  const { don, don_set } = use_donation();
  const [token_state, set_token_state] = useState<TTokenState>(undefined);

  const {
    handleSubmit,
    reset,
    token,
    errors,
    on_increment,
    tip_format,
    cpf,
    setFocus,
    setValue,
    getValues,
    register,
  } = use_rhf(props.fv, don.recipient.hide_bg_tip ?? false);

  const combobox = (
    <TokenCombobox
      classes="[&:has(:placeholder-shown)]:w-34 w-24"
      disabled={token_state === "loading"}
      btn_disp={(open) => btn_disp(open, token_state)}
      item_key={(t) => t.code}
      item_label={(t) => t.symbol}
      input_placeholder="Select token"
      on_search={search_tokens}
      opt_disp={(t) => (
        <Combobox.Item
          key={t.code}
          className="w-full grid grid-cols-[auto_1fr_auto] items-center gap-x-2 p-2 hover:bg-form-secondary data-highlighted:bg-form-secondary data-selected:font-semibold"
          value={t}
        >
          <img
            src={logo_url(t.logo, is_custom(t.id))}
            className="size-6 rounded-full row-span-2"
            alt=""
          />
          <span className="text-xs">{t.symbol}</span>
          <Combobox.ItemIndicator className="text-muted-fg row-span-2">
            <CheckIcon size={14} />
          </Combobox.ItemIndicator>
          <p
            style={{ color: t.color }}
            className="text-xs col-start-2 text-left"
          >
            {chains[t.network].name}
          </p>
        </Combobox.Item>
      )}
      value={token.value}
      // reapply to portaled
      opts_styles={{
        "--form-primary": don.config?.accent_primary,
        "--form-secondary": don.config?.accent_secondary,
      }}
      on_change={async (t) => {
        try {
          const current_amount = token.value.amount;
          token.onChange({ ...t, amount: current_amount });
          set_token_state("loading");
          const res = await fetch(
            href("/api/tokens/:code/estimate", { code: t.code })
          );
          if (!res.ok) throw res;
          const { usdpu, min }: ITokenEstimate = await res.json();
          set_token_state(undefined);
          token.onChange({ ...t, amount: current_amount, usdpu, min });
        } catch (err) {
          report_error(err);
          set_token_state("error");
        }
      }}
    />
  );

  return (
    <form
      onSubmit={handleSubmit((x) => {
        to_step("crypto", x, "donor", don_set);
        reset();
      })}
      className="flex flex-col gap-y-2 rounded min-h-full"
      autoComplete="off"
    >
      <TokenField
        combobox={combobox}
        ref={token.ref}
        amount={token.value.amount}
        amount_usd={token.value.usdpu * +token.value.amount}
        on_change={(x) => token.onChange({ ...token.value, amount: x })}
        error={errors.token?.amount?.message || errors.token?.id?.message}
        label="Donation amount"
      />

      {token.value.code && !token_state && (
        <Incrementers
          classes="-mt-1"
          disabled={token_state === "error" || token_state === "loading"}
          on_increment={on_increment}
          code={token.value.symbol}
          rate={token.value.usdpu}
          precision={token.value.precision}
          increments={(don.config?.increments || DONATION_INCREMENTS).map(
            (i) => {
              const v = +i.value / token.value.usdpu ** 2;
              return { ...i, value: v.toString() };
            }
          )}
        />
      )}

      {don.recipient.hide_bg_tip ? null : (
        <TipField
          classes="mt-2"
          checked={tip_format.value !== "none"}
          checked_changed={(checked) => {
            if (checked) {
              tip_format.onChange("15");
            } else {
              tip_format.onChange("none");
              setValue("tip", "");
            }
          }}
          tip_format={tip_format.value}
          tip_format_changed={async (format) => {
            tip_format.onChange(format);
            if (format === "none") {
              return setValue("tip", "");
            }
            if (format === "custom") {
              await new Promise((r) => setTimeout(r, 50));
              return setFocus("tip");
            }

            const tkn = getValues("token");
            if (!tkn.amount) return setValue("tip", "");

            const v = (+format / 100) * +tkn.amount;
            setValue("tip", ru_vdec(v, tkn.usdpu, tkn.precision));
          }}
          custom_tip={
            tip_format.value === "custom" ? (
              <div className="relative w-full flex">
                <span className="font-bold text-xs self-center">
                  {token.value.symbol}
                </span>
                <input
                  {...register("tip")}
                  inputMode="decimal"
                  className="w-full text-sm pl-2 focus:outline-none"
                  placeholder="Enter contribution amount"
                  aria-invalid={!!errors.tip?.message}
                />
                <span className="right-6 text-xs text-destructive text-right absolute top-1/2 -translate-y-1/2 empty:hidden">
                  {errors.tip?.message}
                </span>
              </div>
            ) : undefined
          }
        />
      )}

      <CpfToggle
        classes="mt-1"
        checked={cpf.value}
        checked_changed={(x) => cpf.onChange(x)}
      />
      <MethodBenefits subject="crypto" classes="mt-2" />

      <button
        disabled={token_state === "error" || token_state === "loading"}
        className="mt-auto btn btn-form-primary"
        type="submit"
      >
        Continue
      </button>
    </form>
  );
}
