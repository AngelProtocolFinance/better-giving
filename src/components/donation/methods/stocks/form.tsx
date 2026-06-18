import { Combobox } from "@ark-ui/react/combobox";
import type { ITicker } from "@better-giving/stocks";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { useController, useForm } from "react-hook-form";
import { href } from "react-router";
import type { ITokenEstimate } from "#/types/api";
import { report_error } from "@/errors/report";
import { ru_vdec } from "@/helpers/decimal";
import { Form as FormContainer } from "../../../form";
import {
  btn_disp,
  TokenCombobox,
  TokenField,
  type TTokenState,
} from "../../../token-field";
import { init_ticker_option } from "../../common/constants";
import { MethodBenefits } from "../../common/method-benefits";
import { TipField } from "../../common/tip-field";
import { use_donation } from "../../context";
import {
  type StocksDonationDetails as FV,
  stocks_donation_details,
  type TMethodState,
  to_step,
} from "../../types";

async function search_tickers(
  q: string,
  signal: AbortSignal
): Promise<ITicker[]> {
  const res = await fetch(
    `${href("/api/tickers")}?q=${encodeURIComponent(q)}`,
    { signal }
  );
  if (!res.ok) throw res;
  return res.json();
}

export function Form(props: TMethodState<"stocks">) {
  const [ticker_state, set_ticker_state] = useState<TTokenState>(undefined);

  const { don_set, don } = use_donation();
  const initial: FV = {
    ticker: init_ticker_option,
    tip: "",
    tip_format: don.recipient.hide_bg_tip ? "none" : "15",
  };

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    setFocus,
    formState: { isSubmitting, errors },
  } = useForm({
    defaultValues: props.fv || initial,
    criteriaMode: "all",
    resolver: valibotResolver(stocks_donation_details),
  });

  const { field: ticker } = useController<FV, "ticker">({
    control: control,
    name: "ticker",
  });

  const { field: tip_format } = useController({
    name: "tip_format",
    control,
  });

  const combobox = (
    <TokenCombobox
      classes="[&:has(:placeholder-shown)]:w-34 w-24"
      disabled={ticker_state === "loading"}
      btn_disp={(open) => btn_disp(open, ticker_state)}
      item_key={(t) => t.symbol}
      item_label={(t) => t.symbol}
      input_placeholder="Select ticker"
      on_search={search_tickers}
      opt_disp={(t) => (
        <Combobox.Item
          key={t.symbol}
          className="w-full text-left text-xs p-2 grid grid-cols-[1fr_auto] items-center gap-x-2 hover:bg-form-secondary data-[highlighted]:bg-form-secondary data-[state=checked]:font-semibold"
          item={t}
        >
          <div className="space-y-0.5">
            <span className="font-semibold block">{t.symbol}</span>
            <span className="text-xs">{t.name}</span>
          </div>
          <Combobox.ItemIndicator className="text-muted-fg">
            <CheckIcon size={14} />
          </Combobox.ItemIndicator>
        </Combobox.Item>
      )}
      value={ticker.value}
      // reapply to portaled
      opts_styles={{
        "--form-primary": don.config?.accent_primary,
        "--form-secondary": don.config?.accent_secondary,
      }}
      on_change={async (t) => {
        try {
          const current_amount = ticker.value.amount;
          ticker.onChange({ ...t, amount: current_amount });
          set_ticker_state("loading");
          const res = await fetch(
            href("/api/tickers/:symbol/estimate", { symbol: t.symbol })
          );
          if (!res.ok) throw res;
          const { usdpu, min }: ITokenEstimate = await res.json();
          set_ticker_state(undefined);
          ticker.onChange({ ...t, amount: current_amount, usdpu, min });
        } catch (err) {
          report_error(err);
          set_ticker_state("error");
        }
      }}
    />
  );

  return (
    <FormContainer
      className="flex flex-col gap-y-2 h-full"
      onSubmit={handleSubmit((fv) =>
        // skip donor step
        to_step("stocks", fv, "checkout", don_set)
      )}
    >
      <TokenField
        combobox={combobox}
        ref={ticker.ref}
        amount={ticker.value.amount}
        amount_usd={ticker.value.usdpu * +ticker.value.amount}
        on_change={(x) => ticker.onChange({ ...ticker.value, amount: x })}
        error={errors.ticker?.amount?.message || errors.ticker?.symbol?.message}
        label="Stock donation details"
      />

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

            const amnt = getValues("ticker.amount");
            if (!amnt) return setValue("tip", "");

            const v = (+format / 100) * +amnt;
            setValue("tip", ru_vdec(v, 1));
          }}
          custom_tip={
            tip_format.value === "custom" ? (
              <div className="relative w-full">
                <input
                  {...register("tip")}
                  type="number"
                  step="any"
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

      <MethodBenefits subject="stock" classes="mt-4" />
      <button
        disabled={isSubmitting}
        className="mt-auto btn btn-form-primary"
        type="submit"
      >
        Continue
      </button>
    </FormContainer>
  );
}
