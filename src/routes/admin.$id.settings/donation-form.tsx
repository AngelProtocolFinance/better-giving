import { Field as BaseField } from "@base-ui/react/field";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { DollarSign } from "lucide-react";
import { useController, useFieldArray, useForm } from "react-hook-form";
import { useFetcher } from "react-router";
import * as v from "valibot";
import { DonateFrequencies } from "#/components/donate-frequencies";
import { DonateMethods, fill } from "#/components/donate-methods";
import { Form as F, Field } from "#/components/form";
import {
  GoalSelector,
  target,
  to_form_target,
  to_target,
} from "#/components/goal-selector";
import { Increments } from "#/components/increments";
import { donate_method } from "#/types/components";
import { to_freq_bools, to_freqs } from "@/helpers/donation";
import type { DonateMethodId, INpoUpdate } from "@/npo";
import {
  donate_freq_opts_bool,
  increment,
  increment_label_max_chars,
  MAX_NUM_INCREMENTS,
  type TFrequency,
} from "@/schemas";

const schema = v.object({
  increments: v.pipe(
    v.array(increment),
    v.maxLength(
      MAX_NUM_INCREMENTS,
      ({ requirement }) => `cannot have more than ${requirement} increments`
    )
  ),
  donate_methods: v.pipe(
    v.array(donate_method),
    v.filterItems((m) => !m.disabled),
    v.minLength(1, "at least one payment option should be active")
  ),
  freqs: donate_freq_opts_bool,
  target,
});

type FV = v.InferInput<typeof schema>;

interface Props {
  donate_methods: DonateMethodId[];
  increments: { label: string; value: string }[];
  target: string | undefined;
  freqs: TFrequency[] | undefined;
}

export function DonationFormTab(p: Props) {
  const fetcher = useFetcher();

  const {
    reset,
    register,
    handleSubmit,
    formState: { isSubmitting, isDirty, errors },
    control,
    watch,
  } = useForm<FV>({
    resolver: valibotResolver(schema),
    values: {
      donate_methods: fill(p.donate_methods),
      increments: p.increments,
      target: to_form_target(p.target),
      freqs: to_freq_bools(p.freqs),
    },
  });

  const { field: donate_methods } = useController({
    control,
    name: "donate_methods",
  });

  const increments = useFieldArray({
    control,
    name: "increments",
  });

  const { field: target } = useController({
    control,
    name: "target.type",
  });

  const { field: freqs } = useController({
    control,
    name: "freqs",
  });

  const incs = watch("increments");

  const onSubmit = handleSubmit(
    async ({ donate_methods, target: fvTarget, freqs, ...fv }) => {
      const update: Partial<INpoUpdate> = {
        ...fv,
        target: to_target(fvTarget),
        donate_methods: donate_methods
          .filter((m) => !m.disabled)
          .map((m) => m.id),
        donate_frequencies: to_freqs(freqs),
      };

      fetcher.submit(update as any, {
        method: "POST",
        action: ".",
        encType: "application/json",
      });
    }
  );

  return (
    <F
      disabled={isSubmitting || fetcher.state !== "idle"}
      onReset={(e) => {
        e.preventDefault();
        reset();
      }}
      onSubmit={onSubmit}
      className="grid content-start gap-6"
    >
      <DonateMethods
        classes={{
          container: "mt-2",
          label: "",
          tooltip: "italic text-sm",
        }}
        values={donate_methods.value}
        on_change={donate_methods.onChange}
        error={errors.donate_methods?.message}
        ref={donate_methods.ref}
      />

      <DonateFrequencies
        value={freqs.value}
        on_change={freqs.onChange}
        classes="mt-6"
        error={errors.freqs?.message}
        ref={freqs.ref}
      />

      <Increments
        classes="mt-8 mb-10"
        fields={increments.fields}
        onAdd={(val) => {
          if (increments.fields.length >= 4) {
            return alert("You can only have 4 increments");
          }
          increments.append({ value: val, label: "" });
        }}
        onRemove={(idx) => increments.remove(idx)}
        countError={errors.increments?.root?.message}
        field={(idx) => (
          <>
            <BaseField.Root className="grid grid-rows-subgrid row-span-2">
              <div className="relative w-full">
                <DollarSign
                  size={15}
                  className="text-muted-fg absolute top-1/2 left-2 transform -translate-y-1/2"
                />
                <input
                  type="number"
                  {...register(`increments.${idx}.value`)}
                  className="w-full h-full  outline-ring rounded text-sm font-medium bg-input pl-8 pr-4 py-3.5 placeholder:text-muted-fg border disabled:pointer-events-none disabled:bg-muted disabled:text-muted-fg"
                />
              </div>

              <p className="mt-1 empty:hidden text-left text-xs text-destructive">
                {errors.increments?.[idx]?.value?.message}
              </p>
            </BaseField.Root>
            <BaseField.Root className="grid grid-rows-subgrid row-span-2">
              <textarea
                {...register(`increments.${idx}.label`)}
                rows={2}
                className="w-full  outline-ring rounded text-sm font-medium bg-input px-4 py-3.5 placeholder:text-muted-fg border disabled:pointer-events-none disabled:bg-muted disabled:text-muted-fg"
              />
              <p
                data-error={!!errors.increments?.[idx]?.label?.message}
                className="mt-1 text-left text-xs data-[error='true']:text-destructive"
              >
                {incs[idx].label.length}/{increment_label_max_chars}
              </p>
            </BaseField.Root>
          </>
        )}
      />

      <div>
        <p className="label mb-3">Donation goal</p>
        <GoalSelector value={target.value} onChange={target.onChange} />
        {target.value === "fixed" && (
          <Field
            {...register("target.value", { shouldUnregister: true })}
            label="How much money do you want to raise?"
            classes="mt-4 mb-6"
            placeholder="$"
            error={errors?.target?.value?.message}
          />
        )}
      </div>

      <div className="flex gap-3 mt-8">
        <button
          type="reset"
          className="px-6 btn-secondary btn text-sm"
          disabled={!isDirty}
        >
          Reset changes
        </button>
        <button
          type="submit"
          className="px-6 btn btn-primary text-sm"
          disabled={!isDirty}
        >
          Submit changes
        </button>
      </div>
    </F>
  );
}
