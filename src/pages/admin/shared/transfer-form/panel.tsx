import { Dialog } from "@ark-ui/react/dialog";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { InfoIcon, MoveLeft, MoveRight } from "lucide-react";
import { useController, useForm } from "react-hook-form";
import { Field } from "#/components/form";
import { humanize } from "@/helpers/decimal";
import { type Props, type Schema, schema } from "./types";

export function Panel(props: Props) {
  const {
    handleSubmit,
    register,
    formState: { errors, isDirty },
    control,
  } = useForm<Schema>({
    defaultValues: {
      source: props.from || "liq",
      bals: props.bals,
    },
    resolver: valibotResolver(schema),
  });

  const { field: source } = useController({ name: "source", control });

  return (
    <Dialog.Content asChild>
      <form
        onSubmit={handleSubmit(props.onSubmit)}
        className="z-50 fixed-center grid bg-popover text-popover-fg sm:w-full w-[90vw] sm:max-w-lg rounded p-6"
      >
        <h4 className="mb-3 text-xl">
          Transfer{" "}
          {props.from
            ? props.from === "liq"
              ? "to Investments"
              : "to Savings"
            : null}
        </h4>

        {props.from ? (
          <div>
            <p className="text-muted-fg text-sm font-semibold">Balance</p>
            <p className="text-lg font-semibold text-muted-fg">
              ${humanize(props.bals[source.value])}
            </p>
          </div>
        ) : (
          <div className="grid items-center grid-cols-[1fr_auto_1fr] gap-x-4 border-y py-4">
            <p className=" justify-self-end">
              <span className="text-muted-fg text-xs mr-1">from</span>
              {source.value === "liq" ? (
                <span className="text-warning font-semibold">Savings</span>
              ) : (
                <span className="text-success font-semibold">Investments</span>
              )}
              <span className="text-sm font-semibold text-muted-fg ml-2">
                ${humanize(props.bals[source.value])}
              </span>
            </p>

            <button
              type="button"
              onClick={() =>
                source.onChange(source.value === "liq" ? "lock" : "liq")
              }
              className="relative p-6 border-t hover:outline hover:outline-primary outline-primary  shadow-xl shadow-black/10 rounded-full group"
            >
              <div className="absolute-center">
                <MoveLeft
                  size={20}
                  strokeWidth={2}
                  className="relative top-1.5 right-1 group-active:right-1.5 stroke-muted-fg"
                />
                <MoveRight
                  size={20}
                  strokeWidth={2}
                  className={`relative bottom-1.5 left-1 group-active:left-1.5 ${source.value === "liq" ? "stroke-success" : "stroke-warning"}`}
                />
              </div>
            </button>
            <p className=" justify-self-start">
              <span className="text-muted-fg text-xs mr-1">to</span>
              {source.value === "liq" ? (
                <span className="text-success font-semibold">Investments</span>
              ) : (
                <span className="text-warning font-semibold">Savings</span>
              )}
            </p>
          </div>
        )}

        <Field
          classes="mt-4"
          required
          label="Amount"
          {...register("amount")}
          placeholder="e.g. $ 100"
          error={errors.amount?.message}
        />

        {source.value && (
          <div className="text-sm text-warning bg-warning/10  rounded p-2 mt-4">
            <InfoIcon className="inline relative bottom-px" size={15} /> This
            operation is irreversible.{" "}
            {source.value === "liq"
              ? "Transferring to investments purchases underlying asset of corresponding value"
              : "Withdrawing from investments redeems underlying asset of corresponding value after approval"}
            .
          </div>
        )}

        <button
          type="submit"
          disabled={props.is_submitting || !isDirty}
          className="text-sm btn-primary rounded p-4 font-bold mt-8"
        >
          {props.is_submitting ? "Submitting..." : "Submit"}
        </button>
      </form>
    </Dialog.Content>
  );
}
