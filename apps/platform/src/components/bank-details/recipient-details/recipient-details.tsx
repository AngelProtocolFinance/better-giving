import { Info, LoadingStatus, Select } from "@better-giving/ui";
import { memo, useState } from "react";
import type { IFormButtons, OnSubmit } from "../types";
import { RecipientDetailsForm } from "./recipient-details-form";
import { use_requirements } from "./use-requirements";

type Props = {
  disabled: boolean;
  currency: string;
  amount: number;
  FormButtons: IFormButtons;
  onSubmit: OnSubmit;
  verified?: boolean;
};

function _RecipientDetails({
  amount,
  currency,
  disabled,
  FormButtons,
  onSubmit,
  verified,
}: Props) {
  const { req } = use_requirements(!amount ? null : { amount, currency });
  const { data, isLoading, isValidating, error } = req;
  const requirements = data?.requirements || [];
  const [selected_idx, set_selected_idx] = useState(0);

  // a list that shrinks below the pick drops it for good: a later refresh that
  // restores the option must not switch the form back under the user
  const req_idx = selected_idx < requirements.length ? selected_idx : 0;
  if (req_idx !== selected_idx) set_selected_idx(req_idx);

  if (isLoading) {
    return (
      <LoadingStatus classes="text-primary text-sm">
        Loading requirements…
      </LoadingStatus>
    );
  }

  if (amount === 0) {
    return (
      <Info classes="text-sm">Please enter expected donation amount.</Info>
    );
  }

  if (requirements.length === 0 || error) {
    return (
      <Info classes="text-sm">
        Target currency <span className="font-bold">{currency}</span> is not
        supported. Please use a bank account with a different currency.
      </Info>
    );
  }

  return (
    <>
      {isValidating && (
        <LoadingStatus classes="text-primary text-xs">
          Refreshing requirements..
        </LoadingStatus>
      )}
      <Select
        label="Transfer type"
        required
        value={req_idx.toString()}
        onChange={(value) => set_selected_idx(+value)}
        options={requirements.map((_, i) => i.toString())}
        option_disp={(x) => requirements[+x].title}
        disabled={disabled || isValidating}
        classes={{ options: "text-sm" }}
      />

      <RecipientDetailsForm
        verified={verified}
        disabled={disabled}
        quoteId={req.data?.quoteId ?? ""}
        type={requirements[req_idx].type}
        currency={currency}
        amount={amount}
        fields={requirements[req_idx]?.fields.flatMap((f) => f.group) || []}
        FormButtons={FormButtons}
        onSubmit={onSubmit}
      />
    </>
  );
}

export const RecipientDetails = memo(_RecipientDetails);
