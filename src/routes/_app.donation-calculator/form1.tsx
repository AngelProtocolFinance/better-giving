import { Field } from "@ark-ui/react/field";
import { CircleHelpIcon } from "lucide-react";
import { MaskedInput } from "#/components/form";
import { mask, unmask } from "#/components/form/masks/dollar";
import { Arrow, Content, Tooltip } from "#/components/tooltip";
import { methods, methodsArr, type OgInput } from "#/types/donation-calculator";
import { PctSlider } from "./pct-slider";

interface Props {
  classes?: string;
  state: OgInput;
  setState: (x: OgInput) => void;
}

export function Form1({ classes = "", state, setState }: Props) {
  return (
    <form className={`${classes} p-6 @container`}>
      <h2 className="text-lg sm:text-xl mb-4">
        How Do You Manage Online Donations Today?
      </h2>

      <MaskedInput
        id="annual-online-donations"
        inputMode="decimal"
        value={mask(state.amnt)}
        onChange={(x) => setState({ ...state, amnt: +unmask(x) })}
        label="Annual Online Donations"
        placeholder="$"
        classes={{
          label: "label",
          input: "field-input",
          container: "mb-4",
        }}
        sub="Total amount received through online platforms"
      />

      <PctSlider
        range={[0, 0.1]}
        label="Average Processing Fees"
        classes="mt-8"
        value={+state.processingFeeRate}
        onChange={(x) => setState({ ...state, processingFeeRate: x })}
        tooltip="Processing fees are charges imposed by third-party payment processors (like banks and credit card companies) for handling online transactions."
      />
      <PctSlider
        range={[0, 0.1]}
        label="Donation Platform Fees"
        classes="mt-8"
        value={+state.platformFeeRate}
        onChange={(x) => setState({ ...state, platformFeeRate: x })}
        tooltip="Platform fees are additional charges imposed by donation platform providers, separate from payment processing fees. These may include per-transaction fees or percentage-based platform fees."
      />

      <MaskedInput
        id="annual-platform-subscription-cost"
        inputMode="decimal"
        value={mask(state.subsCost)}
        onChange={(x) => setState({ ...state, subsCost: +unmask(x) })}
        label="Annual Platform Subscription Cost"
        placeholder="$"
        classes={{
          label: "label",
          input: "field-input",
          container: "mt-6",
        }}
      />

      <Field.Root className="mt-6">
        <div className="flex items-center gap-2">
          <Field.Input
            checked={state.processingFeeCovered}
            onChange={(e) => {
              setState({
                ...state,
                processingFeeCovered: e.target.checked,
              });
            }}
            type="checkbox"
            className="checkbox"
          />
          <Field.Label className="label text-sm">
            Donors can cover processing fees
          </Field.Label>
        </div>
        <Field.HelperText className=" text-muted-fg mt-1 text-sm">
          Better Giving enables donors to cover fees, and our data shows 80% opt
          to do so.
        </Field.HelperText>
      </Field.Root>

      <p className="mt-6 label ">
        Donation types currently accepted
        <Tooltip
          tip={
            <Content className="max-w-xs text-center bg-popover outline outline-border p-4 text-popover-fg text-xs shadow-lg rounded">
              Based on industry data, each payment type represents a portion of
              potential donations: Credit Card (63%), Bank/ACH (10%), Digital
              Wallets (7%), DAF (12%), Stocks (6%), Crypto (2%). Better Giving
              enables all these payment methods.
              <Arrow />
            </Content>
          }
        >
          <CircleHelpIcon
            size={14}
            className="relative inline bottom-px ml-1"
          />
        </Tooltip>
      </p>
      <div className="grid gap-y-1 mt-2 @md:grid-cols-2 @lg:grid-cols-3">
        {methodsArr.map((m) => {
          return (
            <Field.Root key={m} className="flex items-center gap-2">
              <Field.Input
                type="checkbox"
                className="checkbox"
                checked={state.donMethods.includes(m)}
                onChange={(x) => {
                  if (x.target.checked) {
                    setState({
                      ...state,
                      donMethods: [...state.donMethods, m],
                    });
                  } else if (state.donMethods.length === 1) {
                    // do nothing, at least 1 method must be selected
                  } else {
                    setState({
                      ...state,
                      donMethods: state.donMethods.filter((d) => d !== m),
                    });
                  }
                }}
              />
              <Field.Label className="text-sm">{methods[m]}</Field.Label>
            </Field.Root>
          );
        })}
      </div>
    </form>
  );
}
