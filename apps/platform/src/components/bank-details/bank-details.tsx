import { Combo, DrawerIcon, MaskedInput, Separator } from "@better-giving/ui";
import { dollar } from "@better-giving/ui/masks";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { app_name } from "#/constants/env";
import { use_debouncer } from "#/hooks/use-debouncer";
import type { WiseCurrencyOption } from "#/types/components";
import { report_error } from "@/errors/report";
import { RecipientDetails } from "./recipient-details";
import type { IFormButtons, OnSubmit } from "./types";
import { use_currencies } from "./use-currencies";

/**
 * Denominated in USD
 */
const DEFAULT_EXPECTED_MONTHLY_DONATIONS_AMOUNT = "1000";

const to_label = (c: WiseCurrencyOption) =>
  `${c.code.toUpperCase()} - ${c.name}`;

/** "hong kong dollar" has to find "HongKong", and "usd" has to find the code. */
const strip = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const matches = (text: string, q: string) => strip(text).includes(strip(q));

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
  const [is_submitting, set_submitting] = useState(false);
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
      set_submitting(true);
      await onSubmit(...params);
    } catch (error) {
      // All errors should be handled in `onSubmit`.
      // This try/catch is just to ensure that `is_submitting`
      // is set to false at the end of the operation.
      report_error(error);
    } finally {
      set_submitting(false);
    }
  };

  return (
    <div className="grid gap-6">
      <Combo
        value={currency}
        on_change={(c) => c && setCurrency(c)}
        options={{
          items: currencies.data ?? [],
          loading: currencies.is_loading,
          error: currencies.is_error ? "Failed to load currencies" : undefined,
        }}
        item_key={(c) => c.code}
        item_text={to_label}
        filter={matches}
        // the full list is the point here — a payout currency is picked from
        // what wise supports, not from the default RESULT_LIMIT of 10 rows
        limit={Number.POSITIVE_INFINITY}
        label="Select your bank account currency:"
        required
        disabled={is_submitting || is_loading}
        classes={{ control: "w-full md:w-80" }}
        adornment={(open, state) =>
          state === "loading" ? (
            <LoaderCircle className="text-muted-fg animate-spin" size={20} />
          ) : (
            <DrawerIcon
              is_open={open}
              size={20}
              className={state === "error" ? "text-destructive" : ""}
            />
          )
        }
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
        mask={dollar}
        value={dollar.mask(+amount)}
        onChange={(amount) => setAmount(dollar.unmask(amount).toString())}
        classes={{ input: "md:w-80" }}
        disabled={is_submitting}
      />

      <Separator classes="before:bg-border after:bg-border" />

      <RecipientDetails
        verified={verified}
        amount={+debounced_amount}
        currency={currency.code}
        disabled={is_submitting || is_loading}
        FormButtons={FormButtons}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
