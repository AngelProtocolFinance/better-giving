import { valibotResolver } from "@hookform/resolvers/valibot";
import { useController, useForm } from "react-hook-form";
import { ru_vdec } from "@/helpers/decimal";
import { Field, Form as FormContainer } from "../../../form";
import { usd_option } from "../../common/constants";
import type { OnIncrement } from "../../common/incrementers";
import { Incrementers } from "../../common/incrementers";
import { MethodBenefits } from "../../common/method-benefits";
import { TipField } from "../../common/tip-field";
import { use_donation } from "../../context";
import {
  type IraQcdDonationDetails as FV,
  ira_qcd_donation_details,
  type TMethodState,
  to_step,
} from "../../types";

export function Form(props: TMethodState<"ira_qcd">) {
  const { don_set, don } = use_donation();
  const hide_tip = don.recipient.hide_bg_tip ?? false;

  const initial: FV = {
    amount: "",
    tip: "",
    tip_format: hide_tip ? "none" : "15",
    custodian: "",
  };

  const {
    register,
    control,
    handleSubmit,
    getValues,
    trigger,
    setValue,
    setFocus,
    formState: { isSubmitting, errors },
  } = useForm<FV>({
    defaultValues: props.fv || initial,
    resolver: valibotResolver(ira_qcd_donation_details),
    criteriaMode: "all",
  });

  const { field: tip_format } = useController({ control, name: "tip_format" });

  const on_increment: OnIncrement = (inc) => {
    const amnt = Number(getValues("amount"));
    if (Number.isNaN(amnt)) return trigger("amount", { shouldFocus: true });
    setValue("amount", ru_vdec(inc + amnt, 1, 0), { shouldValidate: true });
  };

  return (
    <FormContainer
      disabled={isSubmitting}
      onSubmit={handleSubmit((fv) =>
        // skip donor step
        to_step("ira_qcd", fv, "checkout", don_set)
      )}
      className="flex flex-col gap-y-2 min-h-full"
    >
      <Field
        required
        {...register("amount")}
        inputMode="decimal"
        label="Donation amount"
        classes={{ label: "" }}
        placeholder="Enter amount (USD)"
        error={errors.amount?.message}
      />

      <Incrementers
        on_increment={on_increment}
        code={usd_option.code}
        rate={usd_option.rate}
        increments={don.config?.increments}
        precision={0}
      />

      <Field
        {...register("custodian")}
        label="IRA provider / custodian"
        classes={{ label: "" }}
        placeholder="e.g. Fidelity, Schwab, Vanguard"
        error={errors.custodian?.message}
      />

      {hide_tip ? null : (
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

            const amnt = getValues("amount");
            if (!amnt) return setValue("tip", "");

            const v = (+format / 100) * +amnt;
            setValue("tip", ru_vdec(v, 1));
          }}
          custom_tip={
            tip_format.value === "custom" ? (
              <div className="relative w-full flex items-baseline">
                <span className="font-bold text-2xs self-baseline text-form-primary">
                  {usd_option.code}
                </span>
                <input
                  {...register("tip")}
                  type="number"
                  step="any"
                  className="w-full text-sm pl-1 focus:outline-none"
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

      <MethodBenefits subject="ira_qcd" classes="mt-4" />

      <button className="mt-auto btn btn-form-primary" type="submit">
        Continue
      </button>
    </FormContainer>
  );
}
