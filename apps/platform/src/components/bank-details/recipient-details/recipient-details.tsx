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
  // the picked type, not its index: a new amount can return the same types
  // reordered. null shows the first
  const [picked, set_picked] = useState<string | null>(null);
  const picked_idx = requirements.findIndex((r) => r.type === picked);
  const req_idx = Math.max(picked_idx, 0);

  // a loaded list without the pick drops it for good, for its first type: a
  // later refresh that restores the option must not switch the form back under
  // the user. no data (a new amount's request in flight) is not a drop
  if (data && picked !== null && picked_idx === -1) {
    set_picked(requirements[0]?.type ?? null);
  }

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
        onChange={(value) => set_picked(requirements[+value].type)}
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
