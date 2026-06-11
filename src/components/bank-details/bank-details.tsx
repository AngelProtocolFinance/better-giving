import { useState } from "react";
import { app_name } from "#/constants/env";
import { use_debouncer } from "#/hooks/use-debouncer";
import type { WiseCurrencyOption } from "#/types/components";
import { report_error } from "@/errors/report";
import { CurrencySelector } from "../currency-selector";
import { MaskedInput } from "../form";
import { mask, unmask } from "../form/masks/dollar";
import { Separator } from "../separator";
import { RecipientDetails } from "./recipient-details";
import type { IFormButtons, OnSubmit } from "./types";
import { use_currencies } from "./use-currencies";

/**
 * Denominated in USD
 */
const DEFAULT_EXPECTED_MONTHLY_DONATIONS_AMOUNT = "1000";

type Props = {
  FormButtons: IFormButtons;
  /** All errors should be handled inside `onSubmit` */
  onSubmit: OnSubmit;
  is_loading: boolean;
  verified?: boolean;
};

export function BankDetails({
  FormButtons,
  onSubmit,
  is_loading,
  verified,
}: Props) {
  const currencies = use_currencies();
  const [isSubmitting, setSubmitting] = useState(false);
  const [currency, setCurrency] = useState<WiseCurrencyOption>({
    code: "USD",
    name: "United States Dollar",
    rate: null,
  });

  const [amount, setAmount] = useState(
    DEFAULT_EXPECTED_MONTHLY_DONATIONS_AMOUNT
  );
  const [debounced_amount] = use_debouncer(amount, 500);

  const handleSubmit: OnSubmit = async (...params) => {
    try {
      setSubmitting(true);
      await onSubmit(...params);
    } catch (error) {
      // All errors should be handled in `onSubmit`.
      // This try/catch is just to ensure that `isSubmitting`
      // is set to false at the end of the operation.
      report_error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6">
      <CurrencySelector
        currencies={currencies}
        onChange={(c) => setCurrency(c)}
        value={currency}
        classes={{ combobox: "w-full md:w-80", options: "text-sm" }}
        disabled={isSubmitting || is_loading}
        label="Select your bank account currency:"
        required
      />
      <MaskedInput
        id="expected-monthly-donations"
        label="What is the amount you expect to receive monthly on our
        platform?"
        sub={
          <p className="text-muted-fg text-sm my-2 italic">
            Depending on how much you expect to receive each month via{" "}
            {app_name}, different details are required. At this point, we
            recommend using a conservative figure - Maybe $1000 per month.
          </p>
        }
        value={mask(+amount)}
        onChange={(amount) => setAmount(unmask(amount).toString())}
        classes={{ input: "md:w-80" }}
        disabled={isSubmitting}
      />

      <Separator classes="before:bg-border after:bg-border" />

      <RecipientDetails
        verified={verified}
        amount={+debounced_amount}
        currency={currency.code}
        disabled={isSubmitting || is_loading}
        FormButtons={FormButtons}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
