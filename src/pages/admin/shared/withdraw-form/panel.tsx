import { Dialog } from "@base-ui/react/dialog";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { InfoIcon } from "lucide-react";
import { useController, useForm } from "react-hook-form";
import { Field } from "#/components/form";
import { Select } from "#/components/selector";
import { humanize } from "@/helpers/decimal";
import { type Props, type Schema, type Source, schema, sources } from "./types";

const opts_display: { [K in Source]: string } = {
  liq: "Savings",
  lock: "Investments",
};

export function Panel(props: Props) {
  const {
    handleSubmit,
    register,
    formState: { errors, isDirty },
    control,
  } = useForm<Schema>({
    defaultValues: {
      source: props.from,
      bals: props.bals,
    },
    resolver: valibotResolver(schema),
  });

  const { field: source } = useController({ name: "source", control });

  return (
    <Dialog.Popup
      render={<form onSubmit={handleSubmit(props.onSubmit)} />}
      className="z-50 fixed-center grid bg-popover text-popover-fg sm:w-full w-[90vw] sm:max-w-lg rounded p-6"
    >
      <h4 className="mb-3 text-xl">Withdraw</h4>

      <Select
        required
        ref={source.ref}
        label="Withdraw from"
        onChange={source.onChange}
        value={source.value}
        options={sources as any}
        error={errors.source?.message}
        option_disp={(opt) =>
          opt && (
            <p className="text-sm">
              <span>{opts_display[opt]}: </span>
              <span className="text-muted-fg">
                ${humanize(props.bals[opt])}
              </span>
            </p>
          )
        }
        disabled={props.is_submitting || !!props.from}
      />
      <Field
        classes="mt-5"
        required
        label="Amount"
        {...register("amount")}
        placeholder="e.g. $ 100"
        error={errors.amount?.message}
      />

      {source.value && (
        <div className="text-sm text-warning bg-warning/10  rounded p-2 mt-4">
          <InfoIcon className="inline relative bottom-px" size={15} /> This
          operation is irreversible. Withdrawing from{" "}
          {source.value === "liq"
            ? "savings"
            : "investments redeems underlying asset and"}{" "}
          creates a grant of corresponding value{" "}
          {source.value === "lock" ? " upon approval" : ""}.
        </div>
      )}

      <button
        type="submit"
        disabled={props.is_submitting || !isDirty}
        className="text-sm btn-primary rounded p-4 font-bold mt-8"
      >
        {props.is_submitting ? "Submitting..." : "Submit"}
      </button>
    </Dialog.Popup>
  );
}
